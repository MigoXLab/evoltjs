/**
 * Tool call management
 *
 * Converts Python's toolcall_manager.py to TypeScript
 */

import { randomUUID } from 'crypto';
import { Toolcall } from '../schemas/toolCall';
import { executeSingleTool } from '../utils/toolUtil';
import { ToolStore } from '../types';
import { runWithManager } from './context';
import { logger } from '../utils';

// Re-export for backward compatibility
export { getCurrentManager } from './context';

/**
 * Background process status
 */
export enum BackgroundProcessStatus {
    IDLE = 'idle',
    RUNNING = 'running',
}

/**
 * Background process info
 */
interface BackgroundProcessInfo {
    process: any; // Node.js ChildProcess or similar
    command: string;
    pid: number;
    cwd: string;
}

/**
 * Tool call manager for handling tool execution and observation
 */
export class ToolcallManager {
    private poolSize: number;
    private semaphore: { available: number };
    private tasks: Set<Promise<any>> = new Set();

    private todo: Map<string, Toolcall> = new Map();
    private done: Map<string, Toolcall> = new Map();
    private failed: Map<string, Toolcall> = new Map();

    private toolStores: ToolStore[];
    private executedResults: (string | Record<string, any>)[] = [];

    // Background process management
    private backgroundProcesses: Map<string, BackgroundProcessInfo> = new Map();
    private monitorTasks: Map<string, Promise<any>> = new Map();

    constructor(poolSize: number = 5, toolStore: ToolStore[] = []) {
        this.poolSize = poolSize;
        this.semaphore = { available: poolSize };
        this.toolStores = toolStore;
    }

    /**
     * Get executed results
     */
    getExecutedResults(): Toolcall[] {
        return Array.from(this.done.values()).concat(Array.from(this.failed.values()));
    }

    /**
     * Clear executed results
     */
    clear(): void {
        this.todo.clear();
        this.done.clear();
        this.failed.clear();
        this.executedResults = [];
    }

    /**
     * Add tool calls to be executed
     */
    addToolcall(toolCall: Toolcall | Toolcall[]): void {
        if (Array.isArray(toolCall)) {
            toolCall.forEach(tc => {
                this.todo.set(tc.toolCallId, tc);
            });
            logger.debug(`ToolcallManager: Added ${toolCall.length} toolcalls`);
        } else {
            this.todo.set(toolCall.toolCallId, toolCall);
            logger.debug(`ToolcallManager: Added toolcall: ${toolCall.name}`);
        }
    }

    /**
     * Execute single task with pool control
     */
    private async executeWithPool(toolcall: Toolcall): Promise<void> {
        if (!toolcall || !toolcall.name) {
            return;
        }

        if (!toolcall.isExtractedSuccess && toolcall.type === 'user') {
            this.failed.set(toolcall.toolCallId, toolcall);
            return;
        }

        // Acquire semaphore
        while (this.semaphore.available <= 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        this.semaphore.available--;

        try {
            toolcall.executedState = 'running';

            // Truncate tool call input for logging
            let toolcallInputStr = JSON.stringify(toolcall.input);
            if (toolcallInputStr.length > 200) {
                toolcallInputStr = toolcallInputStr.substring(0, 100) + ' ...(truncated by 100 characters)';
            }

            const toolcallDescription = `${toolcall.name}(${toolcallInputStr})`;
            logger.debug(`开始执行任务: ${toolcallDescription}`);

            // Execute tool call
            const result = await runWithManager(this, () => executeSingleTool(toolcall, this.toolStores));
            // Do not overwrite executedState here, let executeSingleTool handle it
            // toolcall.executedState = 'success';

            // Update status and results
            // Important: Ensure we're not adding raw tool result objects that might not be compatible with MessageHistory
            // For tool calls, we generally want to pass the result object directly if it's a properly formatted tool output
            // or a string if it's a system tool output.

            const obs = result.executedResult();

            if (typeof obs === 'object' && 'content' in obs) {
                logger.debug(`Observation of ${toolcall.name}, tool_call_id: ${toolcall.toolCallId}:\n${obs.content}`);
            } else {
                logger.debug(`Observation of ${toolcall.name}:\n${obs}`);
            }

            if (result.executedState === 'success') {
                logger.debug(`任务执行成功: ${toolcallDescription}`);
                this.done.set(toolcall.toolCallId, result);
            } else if (result.executedState === 'failed') {
                logger.error(`任务执行失败: ${toolcallDescription}, 错误: ${result.executedContent || 'Unknown error'}`);
                this.failed.set(toolcall.toolCallId, result);
            } else if (result.executedState === 'running') {
                logger.warn(`任务执行中: ${toolcallDescription}`);
            } else {
                logger.warn(`任务执行状态未知: ${toolcallDescription}`);
            }

            // Add background process status if running
            const [backgroundProcessStatus, backgroundResult] = this.listBackgroundProcesses();
            if (backgroundProcessStatus === BackgroundProcessStatus.RUNNING) {
                // If background process info needs to be appended, we must be careful not to break the tool response structure
                // For now, appending to content string if it's a tool message object
                if (typeof obs === 'object' && 'content' in obs) {
                    // Clone obs to avoid modifying reference
                    const newObs = { ...obs };
                    if (typeof backgroundResult === 'string') {
                        newObs.content = `${newObs.content}\n\n${backgroundResult}`;
                    } else if (typeof backgroundResult === 'object') {
                        newObs.content = `${newObs.content}\n\nbackground process observation: ${(backgroundResult as any).content}`;
                    }
                    this.executedResults.push(newObs);
                } else if (typeof obs === 'string') {
                    if (typeof backgroundResult === 'string') {
                        this.executedResults.push(obs + '\n\n' + backgroundResult);
                    } else {
                        this.executedResults.push(obs + '\n\nbackground process observation: ' + (backgroundResult as any).content);
                    }
                } else {
                    // Unknown type, just push obs
                    this.executedResults.push(obs);
                }
            } else {
                this.executedResults.push(obs);
            }
        } catch (error) {
            logger.error(`任务执行异常: ${toolcall.name}, 错误: ${error}`);
            toolcall.executedState = 'failed';
            toolcall.executedContent = String(error);
            this.failed.set(toolcall.toolCallId, toolcall);
            this.executedResults.push(toolcall.executedResult() as any); // Cast to any to allow string or object
        } finally {
            // Release semaphore
            this.semaphore.available++;
        }
    }

    /**
     * Execute all pending tasks (background execution, returns immediately)
     */
    async execute(): Promise<any[]> {
        const executionPromises: Promise<void>[] = [];

        for (const [toolcallId, toolcall] of this.todo) {
            this.todo.delete(toolcallId);

            const executionPromise = this.executeWithPool(toolcall);
            this.tasks.add(executionPromise);

            executionPromise.finally(() => {
                this.tasks.delete(executionPromise);
            });

            executionPromises.push(executionPromise);
        }

        // Wait for all executions to start
        await Promise.all(executionPromises);
        return this.executedResults;
    }

    /**
     * Observe execution results
     */
    async observe(
        waitAll: boolean = false,
        timeout: number | null = null
    ): Promise<string | Record<string, any> | (string | Record<string, any>)[]> {
        // Start all pending tasks
        await this.execute();

        // Give tasks some time to execute (even if not waiting for all)
        if (this.tasks.size > 0 && !waitAll) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Wait for all tasks to complete if requested
        if (waitAll && this.tasks.size > 0) {
            if (timeout) {
                // Wait with timeout
                try {
                    await Promise.race([
                        Promise.all(Array.from(this.tasks)),
                        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout * 1000)),
                    ]);
                } catch (error) {
                    logger.warn(`等待任务完成超时 (${timeout}秒)，当前还有 ${this.tasks.size} 个任务在运行`);
                }
            } else {
                // Wait without timeout
                await Promise.all(Array.from(this.tasks));
            }
        }

        if (this.executedResults.length === 0) {
            return '';
        }

        // Return array of results directly - Agent loop will handle them
        // This is important for preserving tool_call_id in objects
        const results = [...this.executedResults];
        this.clear(); // Clear observed results
        return results;
    }

    /**
     * Wait for all tasks to complete
     */
    async waitAll(): Promise<void> {
        if (this.tasks.size > 0) {
            await Promise.all(Array.from(this.tasks));
            logger.info('所有任务已完成');
        }
    }

    /**
     * Get current status
     */
    getStatus(): Record<string, any> {
        return {
            pool_size: this.poolSize,
            running_tasks: this.tasks.size,
            pending: this.todo.size,
            done: this.done.size,
            failed: this.failed.size,
            background_processes: this.backgroundProcesses.size,
            monitor_tasks: this.monitorTasks.size,
        };
    }

    /**
     * Get pending tool call count
     */
    getPendingCount(): number {
        return this.todo.size;
    }

    // Background process management methods

    /**
     * Register a background process
     */
    registerBackgroundProcess(process: any, command: string, cwd: string): string {
        const processId = randomUUID();
        this.backgroundProcesses.set(processId, {
            process,
            command,
            pid: process.pid,
            cwd,
        });

        // Create monitoring task
        const monitorTask = this.monitorProcess(processId, process);
        this.monitorTasks.set(processId, monitorTask);

        logger.info(`注册后台进程: ${command} (PID: ${process.pid}, ID: ${processId})`);
        return processId;
    }

    /**
     * Monitor process until it ends
     */
    private async monitorProcess(processId: string, process: any): Promise<void> {
        try {
            await new Promise<void>((resolve, reject) => {
                process.on('exit', (code: number) => {
                    if (this.backgroundProcesses.has(processId)) {
                        const command = this.backgroundProcesses.get(processId)!.command;
                        this.backgroundProcesses.delete(processId);
                        logger.info(`后台进程已结束: ${command} (PID: ${process.pid}, 返回码: ${code})`);
                    }

                    if (this.monitorTasks.has(processId)) {
                        this.monitorTasks.delete(processId);
                    }
                    resolve();
                });

                process.on('error', (error: Error) => {
                    reject(error);
                });
            });
        } catch (error) {
            logger.error(`监控进程 ${processId} 时发生错误: ${error}`);
            if (this.monitorTasks.has(processId)) {
                this.monitorTasks.delete(processId);
            }
        }
    }

    /**
     * Observe process stdout and stderr
     */
    private async observeProcess(processId: string, timeout: number = 5.0): Promise<string> {
        if (!this.backgroundProcesses.has(processId)) {
            return `未找到进程ID: ${processId}`;
        }

        const info = this.backgroundProcesses.get(processId)!;
        const process = info.process;

        // Simplified implementation - in real scenario you'd collect stdout/stderr
        return `进程ID: ${processId}\n命令: ${info.command}\nPID: ${info.pid}`;
    }

    /**
     * Stop specified background process
     */
    async stopBackgroundProcess(processId: string, force: boolean = false): Promise<string> {
        if (!this.backgroundProcesses.has(processId)) {
            return `未找到进程ID: ${processId}`;
        }

        try {
            const info = this.backgroundProcesses.get(processId);
            if (!info) {
                return `进程ID ${processId} 已被移除`;
            }

            const process = info.process;
            const command = info.command;

            if (process.exitCode !== null) {
                return `进程已经结束 (返回码: ${process.exitCode})\n命令: ${command}`;
            }

            // Terminate process
            if (force) {
                process.kill('SIGKILL');
                logger.info(`强制杀死后台进程: ${command} (PID: ${process.pid})`);
            } else {
                process.kill('SIGTERM');
                logger.info(`终止后台进程: ${command} (PID: ${process.pid})`);
            }

            // Wait for process to end
            try {
                await new Promise<void>(resolve => {
                    const timeoutId = setTimeout(() => {
                        if (!force) {
                            process.kill('SIGKILL');
                            logger.warn(`后台进程未响应终止信号，已强制杀死: ${command}`);
                        }
                        resolve();
                    }, 5000);

                    process.on('exit', () => {
                        clearTimeout(timeoutId);
                        resolve();
                    });
                });
            } catch (error) {
                logger.error(`等待进程结束失败: ${error}`);
            }

            // Cancel monitoring task
            if (this.monitorTasks.has(processId)) {
                const task = this.monitorTasks.get(processId);
                if (task) {
                    // In Node.js, we can't cancel promises, but we can ignore them
                    this.monitorTasks.delete(processId);
                }
            }

            this.backgroundProcesses.delete(processId);

            return `后台进程已停止\n进程ID: ${processId}\n命令: ${command}\n返回码: ${process.exitCode}`;
        } catch (error) {
            logger.error(`停止后台进程 ${processId} 时发生错误: ${error}`);
            throw error;
        }
    }

    /**
     * Clean up all background processes
     */
    async cleanupBackgroundProcesses(): Promise<string> {
        if (this.backgroundProcesses.size === 0) {
            return '没有需要清理的后台进程';
        }

        const count = this.backgroundProcesses.size;
        const processIds = Array.from(this.backgroundProcesses.keys());

        const results: string[] = [];
        for (const processId of processIds) {
            try {
                const result = await this.stopBackgroundProcess(processId);
                results.push(result);
            } catch (error) {
                logger.error(`清理后台进程 ${processId} 时发生错误: ${error}`);
                results.push(`清理进程 ${processId} 失败: ${error}`);
            }
        }

        return `已清理 ${count} 个后台进程:\n` + results.join('\n---\n');
    }

    /**
     * List all background processes
     */
    listBackgroundProcesses(): [BackgroundProcessStatus, string] {
        if (this.backgroundProcesses.size === 0) {
            return [BackgroundProcessStatus.IDLE, '当前没有运行的后台进程。'];
        }

        // Clean up finished processes
        const finishedIds: string[] = [];
        for (const [processId, info] of this.backgroundProcesses) {
            if (info.process.exitCode !== null) {
                finishedIds.push(processId);
            }
        }

        for (const processId of finishedIds) {
            this.backgroundProcesses.delete(processId);
        }

        if (this.backgroundProcesses.size === 0) {
            return [BackgroundProcessStatus.IDLE, '当前没有运行的后台进程。'];
        }

        const result =
            `当前有 ${this.backgroundProcesses.size} 个后台进程:\n` +
            Array.from(this.backgroundProcesses.values())
                .map(process => `PID: ${process.pid}, Command: ${process.command}\n`)
                .join('');

        return [BackgroundProcessStatus.RUNNING, result];
    }

    /**
     * Async context manager entry
     */
    async enter(): Promise<this> {
        return this;
    }

    /**
     * Async context manager exit, clean up all resources
     */
    async exit(): Promise<void> {
        await this.cleanupBackgroundProcesses();
        await this.waitAll();
    }
}

// Removed local getCurrentManager implementation as it is re-exported from context
// export function getCurrentManager(): ToolcallManager | null {
//   return currentManagerStorage.getStore() || null;
// }
