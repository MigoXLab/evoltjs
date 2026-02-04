/**
 * LocalToolExecutor - Local tool executor implementation
 *
 * Implements ToolExecutorProtocol for local execution:
 * - Background async tool call execution
 * - Configurable concurrency limits
 * - Task queue management
 * - Execution result observation
 * - Background process management
 *
 * Corresponds to Python's runtime/executors/local_executor.py
 */

import { ChildProcess } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { ToolStore } from '../../types';
import { logger } from '../../utils';
import {
    ToolExecutorProtocol,
    GeneratedToolcallProtocol,
    ExecutedToolcallProtocol,
    ExecutorStatus,
    createExecutedToolcall,
} from './base';
import { _executeSingleTool } from './utils';

/**
 * Background process info
 */
interface BackgroundProcessInfo {
    process: ChildProcess;
    command: string;
    cwd: string;
    pid: number;
    status: 'running' | 'stopped' | 'completed';
}

/**
 * Context variable for current executor (process-level)
 */
let _currentExecutor: LocalToolExecutor | null = null;

/**
 * Get current executor from context
 */
export function getCurrentExecutor(): LocalToolExecutor | null {
    return _currentExecutor;
}

/**
 * Set current executor in context
 */
export function setCurrentExecutor(executor: LocalToolExecutor | null): void {
    _currentExecutor = executor;
}

/**
 * Local tool executor implementation
 *
 * Implements ToolExecutorProtocol for local execution.
 */
export class LocalToolExecutor implements ToolExecutorProtocol {
    private poolSize: number;
    private toolStores: ToolStore[];

    // Concurrency control
    private semaphore: { available: number };

    // Task management
    private pendingTasks: GeneratedToolcallProtocol[] = [];
    private runningTasks: Set<Promise<void>> = new Set();
    private finishedResults: ExecutedToolcallProtocol[] = [];
    private successTasks: Map<string, ExecutedToolcallProtocol> = new Map();
    private failedTasks: Map<string, ExecutedToolcallProtocol> = new Map();

    // Statistics
    private totalSubmitted: number = 0;
    private totalFinished: number = 0;
    private totalFailed: number = 0;

    // Lifecycle state
    private started: boolean = false;
    private isShutdown: boolean = false;

    // Background process management
    private backgroundProcesses: Map<string, BackgroundProcessInfo> = new Map();

    constructor(poolSize: number = 5, toolStores: ToolStore[] = []) {
        this.poolSize = poolSize;
        this.toolStores = toolStores;
        this.semaphore = { available: poolSize };
    }

    // ---- Lifecycle Methods ----

    async start(): Promise<void> {
        if (this.started) {
            logger.warn('Executor already started');
            return;
        }

        this.semaphore = { available: this.poolSize };
        this.started = true;
        this.isShutdown = false;
        logger.info(`LocalToolExecutor started with max concurrency: ${this.poolSize}`);
    }

    async shutdown(options?: { wait?: boolean }): Promise<void> {
        const wait = options?.wait ?? true;

        if (this.isShutdown) {
            logger.warn('Executor already shutdown');
            return;
        }

        this.isShutdown = true;

        if (wait && this.runningTasks.size > 0) {
            logger.info(`Waiting for ${this.runningTasks.size} running tasks to complete...`);
            await Promise.allSettled(Array.from(this.runningTasks));
            logger.info('All tasks completed');
        }

        // Clean up background processes
        if (this.backgroundProcesses.size > 0) {
            logger.info('Cleaning up background processes...');
            await this.cleanupBackgroundProcesses();
        }

        this.started = false;
        logger.info('LocalToolExecutor shutdown');
    }

    // ---- Execution Methods ----

    async submit(toolcall: GeneratedToolcallProtocol): Promise<void> {
        if (!this.started) {
            throw new Error('Executor not started. Call start() first.');
        }

        if (this.isShutdown) {
            throw new Error('Executor already shutdown');
        }

        this.totalSubmitted++;

        // Create background task
        const task = this._executeToolcall(toolcall);
        this.runningTasks.add(task);

        // Auto cleanup when done
        task.finally(() => {
            this.runningTasks.delete(task);
        });

        logger.debug(`Submitted tool call: ${toolcall.toolName}`);
    }

    async submitMany(
        toolcalls: Iterable<GeneratedToolcallProtocol>,
        options?: { parallel?: boolean }
    ): Promise<void> {
        if (!this.started) {
            throw new Error('Executor not started. Call start() first.');
        }

        const toolcallList = Array.from(toolcalls);
        if (toolcallList.length === 0) {
            return;
        }

        const parallel = options?.parallel ?? true;

        if (parallel) {
            // Parallel: submit all immediately
            for (const toolcall of toolcallList) {
                await this.submit(toolcall);
            }
            logger.debug(`Submitted ${toolcallList.length} tool calls in parallel`);
        } else {
            // Sequential: wait for each to complete
            logger.debug(`Starting sequential execution of ${toolcallList.length} tool calls`);
            for (const toolcall of toolcallList) {
                await this.submit(toolcall);
                // Wait for this task to complete
                while (this.runningTasks.size > 0) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            logger.debug('Sequential execution completed');
        }
    }

    // ---- Observation Methods ----

    async observe(options?: {
        wait?: boolean;
        timeout?: number;
        maxItems?: number;
    }): Promise<ExecutedToolcallProtocol[]> {
        const wait = options?.wait ?? false;
        const timeout = options?.timeout;
        const maxItems = options?.maxItems;

        if (wait && this.finishedResults.length === 0 && this.runningTasks.size > 0) {
            // Wait for at least one result
            const startTime = Date.now();
            while (this.finishedResults.length === 0 && this.runningTasks.size > 0) {
                if (timeout !== undefined) {
                    const elapsed = (Date.now() - startTime) / 1000;
                    if (elapsed >= timeout) {
                        logger.warn(`Observe timeout (${timeout}s), no results yet`);
                        break;
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        // Collect results
        const results: ExecutedToolcallProtocol[] = [];
        let count = 0;

        while (this.finishedResults.length > 0 && (maxItems === undefined || count < maxItems)) {
            results.push(this.finishedResults.shift()!);
            count++;
        }

        if (results.length > 0) {
            logger.debug(`Returning ${results.length} execution results`);
        }

        return results;
    }

    async waitAll(): Promise<void> {
        if (this.runningTasks.size > 0) {
            logger.debug(`Waiting for ${this.runningTasks.size} tasks to complete...`);
            await Promise.allSettled(Array.from(this.runningTasks));
            logger.info('All tasks completed');
        }
    }

    // ---- Status Methods ----

    status(): ExecutorStatus {
        return {
            pending: this.pendingTasks.length,
            running: this.runningTasks.size,
            finished: this.successTasks.size,
            failed: this.failedTasks.size,
            totalSubmitted: this.totalSubmitted,
            isRunning: this.started && !this.isShutdown,
        };
    }

    clear(): void {
        const cleared = this.finishedResults.length;
        this.finishedResults = [];
        this.successTasks.clear();
        this.failedTasks.clear();
        if (cleared > 0) {
            logger.debug(`Cleared ${cleared} execution results`);
        }
    }

    // ---- Private Methods ----

    private async _executeToolcall(toolcall: GeneratedToolcallProtocol): Promise<void> {
        // Check if already executed (idempotency)
        if (this.successTasks.has(toolcall.idempotencyKey) || this.failedTasks.has(toolcall.idempotencyKey)) {
            logger.debug(`Tool call already executed: ${toolcall.toolName}, using cached result`);
            const result = this.successTasks.get(toolcall.idempotencyKey) || this.failedTasks.get(toolcall.idempotencyKey);
            if (result) {
                this.finishedResults.push(result);
            }
            return;
        }

        // Check extraction success
        if (!toolcall.isSuccess) {
            logger.warn(`Tool call extraction failed: ${toolcall.toolName}, reason: ${toolcall.failedReason || 'Unknown'}`);
            const result = createExecutedToolcall(
                toolcall,
                false,
                `Tool extraction failed: ${toolcall.failedReason || 'Unknown'}`
            );
            this.finishedResults.push(result);
            this.totalFailed++;
            this.failedTasks.set(toolcall.idempotencyKey, result);
            return;
        }

        // Acquire semaphore
        while (this.semaphore.available <= 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        this.semaphore.available--;

        try {
            // Set current executor in context
            const previousExecutor = _currentExecutor;
            _currentExecutor = this;

            try {
                // Execute tool
                logger.debug(`Starting execution: ${toolcall.toolName}(${JSON.stringify(toolcall.toolArguments)})`);
                const executedToolcall = await _executeSingleTool(toolcall, this.toolStores);

                // Check execution result
                if (executedToolcall.isSuccess) {
                    logger.debug(`Execution successful: ${executedToolcall.metadata.toolName}`);
                    this.totalFinished++;
                    this.successTasks.set(toolcall.idempotencyKey, executedToolcall);
                } else {
                    logger.warn(
                        `Execution failed: ${executedToolcall.metadata.toolName}, ` +
                        `status: ${executedToolcall.isSuccess}, ` +
                        `reason: ${executedToolcall.result}`
                    );
                    this.totalFailed++;
                    this.failedTasks.set(toolcall.idempotencyKey, executedToolcall);
                }
                this.finishedResults.push(executedToolcall);
            } finally {
                // Restore context
                _currentExecutor = previousExecutor;
            }
        } catch (error) {
            logger.error(`Exception executing tool ${toolcall.toolName}: ${error}`);
            const result = createExecutedToolcall(
                toolcall,
                false,
                `Execution exception: ${error instanceof Error ? error.message : String(error)}`
            );
            this.finishedResults.push(result);
            this.failedTasks.set(toolcall.idempotencyKey, result);
            this.totalFailed++;
        } finally {
            // Release semaphore
            this.semaphore.available++;
        }
    }

    // ---- Background Process Management ----

    registerBackgroundProcess(process: ChildProcess, command: string, cwd: string): string {
        const processId = uuidv4().slice(0, 8);
        this.backgroundProcesses.set(processId, {
            process,
            command,
            cwd,
            pid: process.pid || 0,
            status: 'running',
        });
        logger.debug(`Registered background process: ${processId}, PID: ${process.pid}, Command: ${command}`);
        return processId;
    }

    listBackgroundProcesses(): string {
        if (this.backgroundProcesses.size === 0) {
            return 'No running background processes';
        }

        const lines: string[] = [`Total ${this.backgroundProcesses.size} background processes:\n`];
        for (const [processId, info] of this.backgroundProcesses) {
            const status = info.process.exitCode !== null ? 'completed' : 'running';
            lines.push(
                `- Process ID: ${processId}\n` +
                `  PID: ${info.pid}\n` +
                `  Command: ${info.command}\n` +
                `  Working Dir: ${info.cwd}\n` +
                `  Status: ${status}`
            );
            if (info.process.exitCode !== null) {
                lines.push(`  Exit Code: ${info.process.exitCode}`);
            }
        }
        return lines.join('\n');
    }

    async stopBackgroundProcess(processId: string, force: boolean = false): Promise<string> {
        if (!this.backgroundProcesses.has(processId)) {
            return `Process ${processId} not found`;
        }

        const info = this.backgroundProcesses.get(processId)!;
        const process = info.process;

        if (process.exitCode !== null) {
            return `Process ${processId} already terminated (exit code: ${process.exitCode})`;
        }

        try {
            if (force) {
                process.kill('SIGKILL');
                logger.info(`Force killed process ${process.pid} (Process ID: ${processId})`);
            } else {
                process.kill('SIGTERM');
                logger.info(`Sent SIGTERM to process ${process.pid} (Process ID: ${processId})`);
            }

            // Wait for process to exit
            await new Promise<void>((resolve) => {
                const timeout = setTimeout(() => {
                    if (process.exitCode === null && !force) {
                        process.kill('SIGKILL');
                        logger.warn(`Process ${process.pid} did not respond to SIGTERM, force killed`);
                    }
                    resolve();
                }, 5000);

                process.on('exit', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });

            info.status = 'stopped';
            return `Process ${processId} stopped`;
        } catch (error) {
            logger.error(`Error stopping process ${processId}: ${error}`);
            return `Failed to stop process ${processId}: ${error}`;
        }
    }

    async cleanupBackgroundProcesses(): Promise<string> {
        if (this.backgroundProcesses.size === 0) {
            return 'No background processes to clean up';
        }

        const total = this.backgroundProcesses.size;
        let cleaned = 0;
        const errors: string[] = [];

        for (const processId of Array.from(this.backgroundProcesses.keys())) {
            const info = this.backgroundProcesses.get(processId)!;
            const process = info.process;

            if (process.exitCode === null) {
                try {
                    process.kill('SIGTERM');
                    await new Promise<void>((resolve) => {
                        const timeout = setTimeout(() => {
                            if (process.exitCode === null) {
                                process.kill('SIGKILL');
                            }
                            resolve();
                        }, 3000);

                        process.on('exit', () => {
                            clearTimeout(timeout);
                            resolve();
                        });
                    });
                } catch (error) {
                    errors.push(`Process ${processId}: ${error}`);
                    continue;
                }
            }

            this.backgroundProcesses.delete(processId);
            cleaned++;
        }

        if (errors.length > 0) {
            return `Cleaned ${cleaned}/${total} processes. Errors:\n${errors.join('\n')}`;
        }
        return `Successfully cleaned ${cleaned} background processes`;
    }
}
