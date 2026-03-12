/**
 * LocalToolExecutor — local tool executor implementation.
 *
 * Implements ToolExecutorProtocol using dynamic snapshotting for background tasks,
 * eliminating busy polling and keeping the process state management cohesive.
 *
 * Input:  AgentToolcall  (schemas/toolCall)
 * Output: ToolMessage[]  (schemas/message)
 */

import * as fs from 'fs';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { AgentToolcall } from '../../schemas/toolCall';
import { ToolMessage } from '../../schemas/message';
import { ToolStore } from '../../types';
import { logger } from '../../utils';
import { ToolExecutorProtocol, ExecutorStatus } from './base';
import { _executeSingleTool } from './utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

class BackgroundJob {
    public readonly processId: string;
    public readonly toolcall: AgentToolcall;
    public process?: ChildProcess;
    public readonly command: string;
    public readonly cwd: string;
    public readonly env: NodeJS.ProcessEnv;
    public pgid?: number;

    private readonly _stdoutChunks: Buffer[] = [];
    private readonly _stderrChunks: Buffer[] = [];
    private _isDone: boolean = false;
    private _exitCode: number | null = null;
    private readonly MAX_CHUNKS = 1000;

    constructor(options: {
        processId: string;
        toolcall: AgentToolcall;
        command: string;
        cwd: string;
        env: NodeJS.ProcessEnv;
    }) {
        const { processId, toolcall, command, cwd, env } = options;

        this.processId = processId;
        this.toolcall = toolcall;
        this.command = command;
        this.cwd = cwd;
        this.env = env;
    }

    async execute(signal: AbortSignal): Promise<string | null> {
        if (!fs.existsSync(this.cwd)) {
            this._isDone = true;
            this._exitCode = 1;
            return `Working directory does not exist: ${this.cwd}`;
        }

        this.process = spawn(this.command, {
            shell: true,
            cwd: this.cwd,
            env: this.env,
            detached: os.platform() !== 'win32',
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        if (this.process.pid != null && os.platform() !== 'win32') {
            try { this.pgid = this.process.pid; } catch { }
        }

        logger.debug(`Registered background process: ${this.processId}, PID: ${this.process.pid}, Command: ${this.command}`);

        this.process.stdout?.on('data', (chunk: Buffer) => {
            if (this._stdoutChunks.length > this.MAX_CHUNKS) this._stdoutChunks.shift();
            this._stdoutChunks.push(chunk);
        });

        this.process.stderr?.on('data', (chunk: Buffer) => {
            if (this._stderrChunks.length > this.MAX_CHUNKS) this._stderrChunks.shift();
            this._stderrChunks.push(chunk);
        });

        return new Promise((resolve) => {
            this.process!.once('close', (code) => {
                this._isDone = true;
                this._exitCode = code;
                if (signal?.aborted) return;
                resolve(this.createFinalMessage().content as string);
            });

            if (signal) {
                signal.addEventListener('abort', () => resolve(null));
            }
        });
    }

    get isDone(): boolean {
        return this._isDone;
    }

    get exitCode(): number | null {
        return this._exitCode;
    }

    createSnapshotMessage(): ToolMessage {
        const stdoutBuf = Buffer.concat(this._stdoutChunks);
        const latestOutput = stdoutBuf.length > 2000
            ? stdoutBuf.subarray(stdoutBuf.length - 2000).toString('utf8')
            : stdoutBuf.toString('utf8');

        return new ToolMessage({
            tool_call_id: this.toolcall.tool_call_id,
            tool_name: this.toolcall.tool_name,
            content: `COMMAND: ${this.command}\nPROCESS ID: ${this.processId}\nSTATUS: The process is still executing in the background...\nLATEST OUTPUT:\n${latestOutput}`,
            status: 'running',
            source: this.toolcall.source,
        });
    }

    createFinalMessage(): ToolMessage {
        const stdoutText = Buffer.concat(this._stdoutChunks).toString('utf8').trim();
        const stderrText = Buffer.concat(this._stderrChunks).toString('utf8').trim();
        const parts: string[] = [`COMMAND: ${this.command}`];
        if (stdoutText) parts.push(`STDOUT:\n${stdoutText}`);
        if (stderrText) parts.push(`STDERR:\n${stderrText}`);
        parts.push(`EXIT CODE: ${this._exitCode}`);

        return new ToolMessage({
            tool_call_id: this.toolcall.tool_call_id,
            tool_name: this.toolcall.tool_name,
            content: parts.join('\n\n'),
            status: 'success',
            source: this.toolcall.source,
        });
    }
}

// ---------------------------------------------------------------------------
// Context helpers
// ---------------------------------------------------------------------------

let _currentExecutor: LocalToolExecutor | null = null;

export function getCurrentExecutor(): LocalToolExecutor | null {
    return _currentExecutor;
}

export function setCurrentExecutor(executor: LocalToolExecutor | null): void {
    _currentExecutor = executor;
}

// ---------------------------------------------------------------------------
// LocalToolExecutor
// ---------------------------------------------------------------------------

export class LocalToolExecutor implements ToolExecutorProtocol {
    private readonly _poolSize: number;
    private readonly _toolStores: ToolStore[];
    private readonly _timeout: number;

    private _semaphoreAvailable: number;

    // Track submission order for observe() sorting
    private _submittedTasks: AgentToolcall[] = [];

    // Track actively running initial promises (blocks observe(wait=true))
    private _runningTasks: Set<Promise<void>> = new Set();

    // Store finalized results (completed or failed)
    private _observedResults: ToolMessage[] = [];

    // Idempotency cache
    private _successTasks: Map<string, ToolMessage> = new Map();
    private _failedTasks: Map<string, ToolMessage> = new Map();

    // Background jobs that timed out their initial wait and are still running
    private _activeBackgroundJobs: Map<string, BackgroundJob> = new Map();

    private _totalSubmitted: number = 0;
    private _totalObserved: number = 0;
    private _totalFailed: number = 0;

    private _started: boolean = false;
    private _shutdown: boolean = false;

    // Internal controller to manage current execution session timeouts and cancellations
    private _sessionController: AbortController = new AbortController();

    private static readonly _CMDLINE_HANDLERS: Record<string, string> = {
        'CommandLineTool.execute': 'executeCommand',
        'CommandLineTool.list': 'listBackgroundProcesses',
        'CommandLineTool.stop': 'stopBackgroundProcess',
        'CommandLineTool.cleanup': 'cleanupBackgroundProcesses',
    };

    constructor(options?: {
        poolSize?: number;
        toolStores?: ToolStore[];
        timeout?: number;
    }) {
        this._poolSize = options?.poolSize ?? 5;
        this._toolStores = options?.toolStores ?? [];
        this._timeout = options?.timeout ?? 60.0;
        this._semaphoreAvailable = this._poolSize;
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    async start(): Promise<void> {
        if (this._started) {
            logger.warn('Executor is already started');
            return;
        }
        this._semaphoreAvailable = this._poolSize;
        this._started = true;
        this._shutdown = false;
        logger.info(`LocalToolExecutor started, max concurrency: ${this._poolSize}`);
    }

    async shutdown(options?: { wait?: boolean }): Promise<void> {
        const wait = options?.wait ?? true;

        if (this._shutdown) {
            logger.warn('Executor is already shut down');
            return;
        }
        this._shutdown = true;

        if (this._runningTasks.size > 0) {
            if (wait) {
                logger.info(`Waiting for ${this._runningTasks.size} running tasks to complete...`);
                await Promise.allSettled(Array.from(this._runningTasks));
            } else {
                // If we are not waiting, explicitly abort all running tasks to prevent background leaks
                logger.info(`Aborting ${this._runningTasks.size} running tasks during shutdown...`);
                this._sessionController.abort();
            }
        }

        if (this._activeBackgroundJobs.size > 0) {
            const cleanupResult = await this.cleanupBackgroundProcesses({
                terminateTimeoutMs: wait ? 3000 : 1000,
            });
            logger.info(cleanupResult);
        }

        this._started = false;
        logger.info('LocalToolExecutor shut down');
    }

    private _checkState(): void {
        if (!this._started) throw new Error('Executor not started, please call start() first');
        if (this._shutdown) throw new Error('Executor is shut down');
    }

    // -------------------------------------------------------------------------
    // Submission
    // -------------------------------------------------------------------------

    private _submitOne(toolcall: AgentToolcall): void {
        this._totalSubmitted++;

        const task = this._executeToolcall(toolcall, this._sessionController.signal);
        this._runningTasks.add(task);
        task.finally(() => this._runningTasks.delete(task));

        logger.debug(
            `Submitted tool call: ${toolcall.tool_name}, args: ${String(JSON.stringify(toolcall.tool_arguments)).slice(0, 50)}...`,
        );
    }

    submitAndExecute(toolcalls: Iterable<AgentToolcall>): void {
        this._checkState();
        const list = Array.from(toolcalls);
        if (list.length === 0) return;

        // Reset session controller for a new batch of tasks if previous was aborted
        if (this._sessionController.signal.aborted) {
            this._sessionController = new AbortController();
        }

        for (const tc of list) {
            this._submitOne(tc);
            this._submittedTasks.push(tc);
        }
        logger.debug(`Submitted ${list.length} tool calls to executor`);
    }

    restoreToolcalls(records: any[]): void {
        this._checkState();
        // Reset session controller if needed
        if (this._sessionController.signal.aborted) {
            this._sessionController = new AbortController();
        }

        for (const record of records) {
            for (const tcData of (record?.data?.toolcalls ?? [])) {
                const tc: AgentToolcall = {
                    tool_name: tcData.tool_name ?? '',
                    tool_arguments: tcData.tool_arguments ?? {},
                    tool_call_id: tcData.tool_call_id ?? randomUUID(),
                    source: tcData.source ?? 'chat',
                };
                logger.debug(`Restoring tool call: ${tc.tool_name}`);
                this._submitOne(tc);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Observation (Dynamic Snapshotting)
    // -------------------------------------------------------------------------

    async observe(): Promise<ToolMessage[]> {
        if (this._runningTasks.size > 0) {
            let timer: NodeJS.Timeout | undefined;
            const timeoutPromise = new Promise<void>(resolve => {
                timer = setTimeout(() => {
                    logger.warn(`Observation timeout (${this._timeout}s)`);
                    this._sessionController.abort();
                    resolve();
                }, this._timeout * 1000);
            });

            await Promise.race([
                Promise.allSettled(Array.from(this._runningTasks)),
                timeoutPromise
            ]);

            if (timer) clearTimeout(timer);

            // Yield to the event loop to ensure all microtasks triggered by abort() (e.g. finally cleanup, semaphore release) are completed
            await sleep(0);
        }

        // 2. Flush any background jobs that finished while we were waiting
        this._flushCompletedBackgroundJobs();

        // 3. Collect true finalized results and clear
        const results = this._observedResults.splice(0);

        // 4. Dynamically generate snapshots for jobs STILL running in the background
        for (const job of Array.from(this._activeBackgroundJobs.values())) {
            if (!job.isDone) {
                results.push(job.createSnapshotMessage());
            }
        }

        // 5. Sort by original submission order
        const submitOrder = new Map<string, number>(
            this._submittedTasks.map((tc, i) => [tc.tool_call_id, i]),
        );
        results.sort((a, b) => {
            const ai = submitOrder.get(a.tool_call_id) ?? 999999;
            const bi = submitOrder.get(b.tool_call_id) ?? 999999;
            return ai - bi;
        });

        if (results.length > 0) {
            let report = results
                .map(r => (typeof r.content === 'string' ? r.content : JSON.stringify(r.content)))
                .join('\n');
            if (report.length > 1000) report = report.slice(0, 1000) + ' (...truncated)';
            logger.debug(`Returned ${results.length} execution results:\n ${report}`);
        }

        return results;
    }

    async waitAll(): Promise<void> {
        if (this._runningTasks.size > 0) {
            logger.debug(`Waiting for ${this._runningTasks.size} tasks to complete...`);
            await Promise.allSettled(Array.from(this._runningTasks));
        }
    }

    // -------------------------------------------------------------------------
    // Execution Control
    // -------------------------------------------------------------------------

    abortAll(): void {
        if (!this._sessionController.signal.aborted) {
            logger.info("External interrupt received, aborting tasks...");
            this._sessionController.abort();
        }
    }

    // -------------------------------------------------------------------------
    // Status / housekeeping
    // -------------------------------------------------------------------------

    status(): ExecutorStatus {
        return {
            started: this._started,
            shutdown: this._shutdown,
            maxConcurrency: this._poolSize,
            pendingCount: this._submittedTasks.length,
            runningCount: this._runningTasks.size,
            finishedCount: this._observedResults.length,
            totalSubmitted: this._totalSubmitted,
            totalObserved: this._totalObserved,
            totalFailed: this._totalFailed,
        };
    }

    clear(): void {
        const cleared = this._observedResults.length;
        this._observedResults = [];
        this._successTasks.clear();
        this._failedTasks.clear();
        // Do not clear _activeBackgroundJobs here, as they are real processes.
        if (cleared > 0) logger.debug(`Cleared ${cleared} execution results`);
    }

    // -------------------------------------------------------------------------
    // Internal: result storage
    // -------------------------------------------------------------------------

    private _storeFinalResult(toolCallId: string, result: ToolMessage): void {
        if (result.status === 'failed') {
            logger.warn(`Execution failed: ${result.tool_name}, reason: ${result.content}`);
            this._totalFailed++;
            this._failedTasks.set(toolCallId, result);
        } else {
            this._successTasks.set(toolCallId, result);
        }
        this._observedResults.push(result);
        this._totalObserved++;
    }

    // -------------------------------------------------------------------------
    // Internal: task execution
    // -------------------------------------------------------------------------

    private async _executeToolcall(toolcall: AgentToolcall, signal: AbortSignal): Promise<void> {
        // Cache Check
        const cached =
            this._successTasks.get(toolcall.tool_call_id) ??
            this._failedTasks.get(toolcall.tool_call_id);
        if (cached) {
            this._observedResults.push(cached);
            return;
        }

        while (this._semaphoreAvailable <= 0) {
            await sleep(10);
        }
        this._semaphoreAvailable--;

        const prev = _currentExecutor;
        _currentExecutor = this;

        try {
            logger.debug(`Starting execution: ${toolcall.tool_name}(${JSON.stringify(toolcall.tool_arguments)})`);
            await this._dispatchToolcall(toolcall, signal);
        } finally {
            _currentExecutor = prev;
            this._semaphoreAvailable++;
        }
    }

    /**
     * Dispatch toolcall.
     * Returns ToolMessage if it finishes normally.
     * Returns null if it transitions into the background (handled by executeCommand).
     */
    private async _dispatchToolcall(toolcall: AgentToolcall, signal: AbortSignal): Promise<void> {
        const handlerName = LocalToolExecutor._CMDLINE_HANDLERS[toolcall.tool_name];

        if (!handlerName) {
            const result: ToolMessage = await _executeSingleTool(toolcall, this._toolStores);
            this._storeFinalResult(toolcall.tool_call_id, result);
            return;
        }

        let resultContent: string | null = null;
        let resultStatus: ToolMessage['status'] = 'success';

        const args = { ...toolcall.tool_arguments } as Record<string, any>;

        try {
            if (toolcall.tool_name === 'CommandLineTool.execute') {
                resultContent = await this.executeCommand({
                    command: args.command,
                    cwd: args.cwd,
                    env: args.env,
                    toolcall,
                    signal,
                });
            } else if (toolcall.tool_name === 'CommandLineTool.list') {
                resultContent = this.listBackgroundProcesses();
            } else if (toolcall.tool_name === 'CommandLineTool.stop') {
                resultContent = await this.stopBackgroundProcess(args.process_id, args.force ?? false);
            } else if (toolcall.tool_name === 'CommandLineTool.cleanup') {
                resultContent = await this.cleanupBackgroundProcesses();
            } else {
                throw new Error(`Handler '${handlerName}' not found on executor`);
            }
        } catch (e) {
            logger.error(`Exception occurred while executing tool ${toolcall.tool_name}: ${e}`);
            resultContent = `Error executing tool: ${e instanceof Error ? e.message : String(e)}`;
            resultStatus = 'failed';
        }

        resultContent && this._storeFinalResult(toolcall.tool_call_id, new ToolMessage({
            tool_call_id: toolcall.tool_call_id,
            tool_name: toolcall.tool_name,
            content: resultContent,
            status: resultStatus,
            source: toolcall.source,
        }));
    }

    // -------------------------------------------------------------------------
    // Background Job Management
    // -------------------------------------------------------------------------

    private _flushCompletedBackgroundJobs(): void {
        for (const [processId, job] of Array.from(this._activeBackgroundJobs.entries())) {
            if (!job.isDone) continue;

            const msg = job.createFinalMessage();

            this._storeFinalResult(job.toolcall.tool_call_id, msg);
            this._activeBackgroundJobs.delete(processId);
            logger.debug(`Reissued completion result for background process ${processId}: ${job.command}`);
        }
    }

    // -------------------------------------------------------------------------
    // CommandLineTool handlers
    // -------------------------------------------------------------------------

    private async executeCommand(options: {
        command: string;
        cwd?: string;
        env?: Record<string, string>;
        toolcall: AgentToolcall;
        signal: AbortSignal;
    }): Promise<string | null> {
        const { command, cwd, env, toolcall, signal } = options;
        const workDir = cwd ?? process.cwd();
        const execEnv: NodeJS.ProcessEnv = { ...process.env, ...(env ?? {}) };

        const processId = randomUUID().slice(0, 8);
        const job = new BackgroundJob({
            processId,
            toolcall,
            command,
            cwd: workDir,
            env: execEnv,
        });

        // Store immediately so it can be managed by list/stop/cleanup
        this._activeBackgroundJobs.set(processId, job);

        const result = await job.execute(signal);

        if (result !== null || job.isDone) {
            this._activeBackgroundJobs.delete(processId);
        }

        return result;
    }

    listBackgroundProcesses(): string {
        if (this._activeBackgroundJobs.size === 0) {
            return 'No background processes running';
        }
        const lines: string[] = [`Total ${this._activeBackgroundJobs.size} background processes:\n`];
        for (const [processId, job] of Array.from(this._activeBackgroundJobs.entries())) {
            const rc = job.exitCode;
            const status = rc !== null ? `Completed (exit code: ${rc})` : 'Running';
            lines.push(
                `- Process ID: ${processId}\n` +
                `  PID: ${job.process?.pid ?? 'N/A'}\n` +
                `  Command: ${job.command}\n` +
                `  Working directory: ${job.cwd}\n` +
                `  Status: ${status}`,
            );
        }
        return lines.join('\n');
    }

    async stopBackgroundProcess(processId: string, force: boolean = false): Promise<string> {
        if (!this._activeBackgroundJobs.has(processId)) {
            return `Process ${processId} does not exist`;
        }
        const job = this._activeBackgroundJobs.get(processId)!;
        if (job.isDone) {
            return `Process ${processId} already finished (exit code: ${job.exitCode})`;
        }
        try {
            await this._terminateBackgroundProcess(job.process, job.pgid, {
                force,
                timeoutMs: 5000,
                label: processId,
            });
            return `Process ${processId} stopped`;
        } catch (e) {
            logger.error(`Error stopping process ${processId}: ${e}`);
            return `Failed to stop process ${processId}: ${e}`;
        }
    }

    async cleanupBackgroundProcesses(
        options?: { terminateTimeoutMs?: number },
    ): Promise<string> {
        if (this._activeBackgroundJobs.size === 0) {
            return 'No background processes to clean up';
        }
        const total = this._activeBackgroundJobs.size;
        let cleaned = 0;
        const errors: string[] = [];

        for (const [processId, job] of Array.from(this._activeBackgroundJobs.entries())) {
            if (!job.isDone) {
                try {
                    await this._terminateBackgroundProcess(job.process, job.pgid, {
                        force: false,
                        timeoutMs: options?.terminateTimeoutMs ?? 3000,
                        label: processId,
                    });
                } catch (e) {
                    errors.push(`Process ${processId}: ${e}`);
                    continue;
                }
            }
            this._activeBackgroundJobs.delete(processId);
            cleaned++;
        }

        if (errors.length > 0) {
            return `Cleaned up ${cleaned}/${total} processes. Errors:\n${errors.join('\n')}`;
        }
        return `Successfully cleaned up ${cleaned} background processes`;
    }

    // -------------------------------------------------------------------------
    // Process termination helpers
    // -------------------------------------------------------------------------

    private async _terminateBackgroundProcess(
        proc: ChildProcess | undefined,
        pgid: number | undefined,
        options?: { force?: boolean; timeoutMs?: number; label?: string },
    ): Promise<void> {
        if (!proc || proc.exitCode !== null) return;

        const force = options?.force ?? false;
        const timeoutMs = options?.timeoutMs ?? 3000;
        const tag = options?.label ? ` (${options.label})` : '';

        const sendSignal = (sig: 'SIGTERM' | 'SIGKILL'): void => {
            try {
                if (pgid != null && os.platform() !== 'win32') {
                    process.kill(-pgid, sig);
                } else if (sig === 'SIGKILL') {
                    proc.kill('SIGKILL');
                } else {
                    proc.kill('SIGTERM');
                }
            } catch {
                // Process may already be gone
            }
        };

        sendSignal(force ? 'SIGKILL' : 'SIGTERM');
        logger.info(`${force ? 'Forcefully' : 'Attempting to'} terminate process ${proc.pid}${tag}`);

        const exited = await this._waitForProcessClose(proc, timeoutMs);
        if (!exited && proc.exitCode === null) {
            sendSignal('SIGKILL');
            logger.warn(
                `Process ${proc.pid} did not respond within ${timeoutMs}ms, forcefully killed${tag}`,
            );
            await this._waitForProcessClose(proc, 1000);
        }
    }

    private _waitForProcessClose(proc: ChildProcess, timeoutMs: number): Promise<boolean> {
        if (proc.exitCode !== null) return Promise.resolve(true);
        return Promise.race([
            new Promise<boolean>(resolve => proc.once('close', () => resolve(true))),
            sleep(timeoutMs).then(() => false),
        ]);
    }

    async [Symbol.asyncDispose](): Promise<void> {
        await this.shutdown({ wait: true });
    }
}
