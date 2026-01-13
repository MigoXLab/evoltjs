/**
 * CommandTool - Command line tool for executing bash commands in background
 *
 * Converts Python's cmd_tool.py to TypeScript
 */

import { spawn, ChildProcess } from 'child_process';
import { tools } from './toolRegister';
import { ToolExecutionError } from '../types';
import { getCurrentManager } from './context';
import { logger } from '../utils';

/**
 * CommandTool class for executing commands in background
 */
@tools({
    execute: {
        description: '在后台执行bash命令（不阻塞返回结果）。',
        params: [
            { name: 'command', type: 'str', description: '要执行的bash命令' },
            {
                name: 'cwd',
                type: 'Optional[str]',
                description: '工作目录，如果为None则使用当前目录',
                optional: true,
            },
            {
                name: 'env',
                type: 'Optional[Dict[str, str]]',
                description: '环境变量字典，如果为None则使用当前环境',
                optional: true,
            },
        ],
        returns: { type: 'str', description: '后台进程启动信息，包含进程ID和PID' },
    },
    list: {
        description: '列出所有后台进程。',
        returns: { type: 'str', description: '所有后台进程的信息' },
    },
    stop: {
        description: '停止指定的后台进程。',
        params: [
            { name: 'processId', type: 'str', description: '要停止的进程ID' },
            {
                name: 'force',
                type: 'bool',
                description: '是否强制杀死进程（使用SIGKILL）',
                optional: true,
            },
        ],
        returns: { type: 'str', description: '停止进程的结果信息' },
    },
    cleanup: {
        description: '清理所有后台进程。',
        returns: { type: 'str', description: '清理结果信息' },
    },
})
export class CommandLineTool {
    async execute(command: string, cwd?: string, env?: Record<string, string>): Promise<string> {
        try {
            // 设置工作目录
            const workDir: string = cwd || process.cwd();

            // Check if directory exists
            try {
                const fs = await import('fs');
                if (!fs.existsSync(workDir)) {
                    return `工作目录不存在: ${workDir}`;
                }
            } catch (error) {
                return `无法访问工作目录: ${workDir}`;
            }

            // 设置环境变量
            const execEnv: NodeJS.ProcessEnv = { ...process.env, ...env };

            // 启动进程 (avoid naming conflict with global process)
            const childProcess: ChildProcess = spawn(command, {
                shell: true,
                cwd: workDir,
                env: execEnv,
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            // 获取当前的 ToolcallManager 并注册进程
            const manager = getCurrentManager();
            if (!manager) {
                throw new ToolExecutionError('无法获取 ToolcallManager，请通过 ToolcallManager 执行此工具');
            }

            const processId = manager.registerBackgroundProcess(childProcess, command, workDir);
            logger.debug(`Register background process: Command: ${command}\n Process ID: ${processId}`);

            // 等待最多5秒获取执行结果
            return new Promise(resolve => {
                const timeout = setTimeout(async () => {
                    // 5秒后进程仍在运行
                    resolve(
                        `COMMAND: ${command}\n` +
                            `PROCESS ID: ${processId}\n` +
                            `STATUS: The process may still be executing (waited 5 seconds, not completed)\n` +
                            `TIP: Please use the list command later to check the process status, or wait for the process to complete and then check the result`
                    );
                }, 5000);

                // Collect output
                let stdout = '';
                let stderr = '';

                childProcess.stdout?.on('data', (data: Buffer) => {
                    stdout += data.toString();
                });

                childProcess.stderr?.on('data', (data: Buffer) => {
                    stderr += data.toString();
                });

                childProcess.on('close', (code: number | null) => {
                    clearTimeout(timeout);

                    const stdoutText = stdout.trim();
                    const stderrText = stderr.trim();

                    const resultParts = [`COMMAND: ${command}`];
                    if (stdoutText) {
                        resultParts.push(`STDOUT:\n${stdoutText}`);
                    }
                    if (stderrText) {
                        resultParts.push(`STDERR:\n${stderrText}`);
                    }
                    resultParts.push(`EXIT CODE: ${code}`);

                    resolve(resultParts.join('\n\n'));
                });

                childProcess.on('error', (error: Error) => {
                    clearTimeout(timeout);
                    resolve(`COMMAND: ${command}\nERROR: ${error.message}`);
                });
            });
        } catch (error: any) {
            throw new ToolExecutionError(`Error executing background process '${command}': ${error.message}`);
        }
    }

    /**
     * List all background processes.
     *
     * Returns:
     *     str: The natural language description of the background process list
     */
    async list(): Promise<string> {
        const manager = getCurrentManager();
        if (!manager) {
            throw new ToolExecutionError('Cannot get ToolcallManager, please execute this tool through ToolcallManager');
        }

        const [status, result] = manager.listBackgroundProcesses();
        return result;
    }

    /**
     * 停止指定的后台进程。
     *
     * Args:
     *     process_id (str): 要停止的进程ID
     *     force (bool): 是否强制杀死进程（使用SIGKILL）
     *
     * Returns:
     *     str: 操作结果的自然语言描述
     */
    async stop(processId: string, force: boolean = false): Promise<string> {
        const manager = getCurrentManager();
        if (!manager) {
            throw new ToolExecutionError('Cannot get ToolcallManager, please execute this tool through ToolcallManager');
        }

        return await manager.stopBackgroundProcess(processId, force);
    }

    /**
     * Clean up all background processes.
     *
     * Returns:
     *     str: The natural language description of the cleanup result
     */
    async cleanup(): Promise<string> {
        const manager = getCurrentManager();
        if (!manager) {
            throw new ToolExecutionError('Cannot get ToolcallManager, please execute this tool through ToolcallManager');
        }

        return await manager.cleanupBackgroundProcesses();
    }
}
