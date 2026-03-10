/**
 * Tool Executor Protocol definitions
 *
 * Corresponds to Python's runtime/executors/base.py
 *
 * This module defines the protocol interfaces for tool execution:
 * - GeneratedToolcallProtocol: Legacy parsed tool call from LLM output
 * - ExecutedToolcallProtocol: Legacy executed tool call result
 * - ToolExecutorProtocol: Interface for tool execution backends (AgentToolcall / ToolMessage based)
 */

import { AgentToolcall } from '../../schemas/toolCall';
import { ToolMessage } from '../../schemas/message';

export interface ExecutorStatus {
    started: boolean;
    shutdown: boolean;
    maxConcurrency: number;
    pendingCount: number;
    runningCount: number;
    finishedCount: number;
    totalSubmitted: number;
    totalFinished: number;
    totalFailed: number;
}

/**
 * Protocol interface for tool executors.
 */
export interface ToolExecutorProtocol {
    // ---- Lifecycle ----

    /** Initialize executor resources. */
    start(): Promise<void>;

    /**
     * Shutdown executor and optionally wait for running tasks.
     * @param options.wait - Whether to wait for running tasks to complete (default true)
     */
    shutdown(options?: { wait?: boolean }): Promise<void>;

    // ---- Execution ----

    /**
     * Submit and asynchronously execute multiple tool calls.
     * Corresponds to Python's submit_and_execute().
     */
    submitAndExecute(toolcalls: Iterable<AgentToolcall>): void;

    /**
     * Restore tool calls from persisted records (idempotent, skips already-executed calls).
     * Corresponds to Python's restore_toolcalls().
     */
    restoreToolcalls(records: any[]): void;

    // ---- Observation ----

    /**
     * Collect finished execution results.
     * If wait=true, blocks until all submitted tool calls have produced results (or timeout).
     * Returns results sorted in submission order.
     *
     * Corresponds to Python's observe(*, wait=True).
     */
    observe(): Promise<ToolMessage[]>;

    /** Wait until all submitted tool calls are finished. */
    waitAll(): Promise<void>;

    // ---- Execution Control ----

    /** Abort all currently running tasks and background jobs. */
    abortAll(): void;

    // ---- Status / housekeeping ----

    /** Return executor runtime status. */
    status(): ExecutorStatus;

    /** Clear finished execution results and caches. */
    clear(): void;
}
