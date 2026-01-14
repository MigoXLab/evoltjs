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
        description: 'Execute bash command in background (non-blocking, returns result).',
        params: [
            { name: 'command', type: 'str', description: 'The bash command to execute' },
            {
                name: 'cwd',
                type: 'Optional[str]',
                description: 'Working directory, uses current directory if None',
                optional: true,
            },
            {
                name: 'env',
                type: 'Optional[Dict[str, str]]',
                description: 'Environment variables dictionary, uses current environment if None',
                optional: true,
            },
        ],
        returns: { type: 'str', description: 'Background process startup information, including process ID and PID' },
    },
    list: {
        description: 'List all background processes.',
        returns: { type: 'str', description: 'Information about all background processes' },
    },
    stop: {
        description: 'Stop the specified background process.',
        params: [
            { name: 'processId', type: 'str', description: 'The process ID to stop' },
            {
                name: 'force',
                type: 'bool',
                description: 'Whether to force kill the process (using SIGKILL)',
                optional: true,
            },
        ],
        returns: { type: 'str', description: 'Result information of stopping the process' },
    },
    cleanup: {
        description: 'Clean up all background processes.',
        returns: { type: 'str', description: 'Cleanup result information' },
    },
})
export class CommandLineTool {
    async execute(command: string, cwd?: string, env?: Record<string, string>): Promise<string> {
        try {
            // Set working directory
            const workDir: string = cwd || process.cwd();

            // Check if directory exists
            try {
                const fs = await import('fs');
                if (!fs.existsSync(workDir)) {
                    return `Working directory does not exist: ${workDir}`;
                }
            } catch (error) {
                return `Cannot access working directory: ${workDir}`;
            }

            // Set environment variables
            const execEnv: NodeJS.ProcessEnv = { ...process.env, ...env };

            // Start process (avoid naming conflict with global process)
            const childProcess: ChildProcess = spawn(command, {
                shell: true,
                cwd: workDir,
                env: execEnv,
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            // Get current ToolcallManager and register process
            const manager = getCurrentManager();
            if (!manager) {
                throw new ToolExecutionError('Cannot get ToolcallManager, please execute this tool through ToolcallManager');
            }

            const processId = manager.registerBackgroundProcess(childProcess, command, workDir);
            logger.debug(`Register background process: Command: ${command}\n Process ID: ${processId}`);

            // Wait up to 5 seconds to get execution result
            return new Promise(resolve => {
                const timeout = setTimeout(async () => {
                    // Process is still running after 5 seconds
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
     * Stop the specified background process.
     *
     * Args:
     *     process_id (str): The process ID to stop
     *     force (bool): Whether to force kill the process (using SIGKILL)
     *
     * Returns:
     *     str: Natural language description of the operation result
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
