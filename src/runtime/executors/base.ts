/**
 * Tool Executor Protocol definitions
 *
 * Corresponds to Python's runtime/executors/base.py
 *
 * This module defines the protocol interfaces for tool execution:
 * - GeneratedToolcallProtocol: Represents a parsed tool call from LLM output
 * - ExecutedToolcallProtocol: Represents the result of executing a tool call
 * - ToolExecutorProtocol: Interface for tool execution backends
 */

/**
 * Source of the tool call
 */
export type ToolcallSource = 'chat' | 'function_call';

/**
 * Protocol for a generated tool call (parsed from LLM output)
 */
export interface GeneratedToolcallProtocol {
    /**
     * Name of the tool to execute
     */
    toolName: string;

    /**
     * Arguments for the tool
     */
    toolArguments: Record<string, any>;

    /**
     * Unique identifier for this tool call
     */
    toolCallId: string;

    /**
     * Source of the tool call (chat = XML extraction, function_call = OpenAI function calling)
     */
    source: ToolcallSource;

    /**
     * Whether the tool call was successfully parsed
     */
    isSuccess: boolean;

    /**
     * Reason for failure if isSuccess is false
     */
    failedReason?: string;

    /**
     * Raw content from LLM that generated this tool call
     */
    rawContentFromLlm?: string;

    /**
     * Idempotency key for deduplication
     */
    idempotencyKey: string;
}

/**
 * Protocol for an executed tool call (result)
 */
export interface ExecutedToolcallProtocol {
    /**
     * The original tool call metadata
     */
    metadata: GeneratedToolcallProtocol;

    /**
     * Whether the tool execution was successful
     */
    isSuccess: boolean;

    /**
     * Result of the tool execution (can be any type)
     */
    result: any;
}

/**
 * Status information returned by executor.status()
 */
export interface ExecutorStatus {
    /**
     * Number of pending tasks in queue
     */
    pending: number;

    /**
     * Number of currently running tasks
     */
    running: number;

    /**
     * Number of completed tasks
     */
    finished: number;

    /**
     * Number of failed tasks
     */
    failed: number;

    /**
     * Total tasks submitted
     */
    totalSubmitted: number;

    /**
     * Whether the executor is running
     */
    isRunning: boolean;
}

/**
 * Protocol interface for tool executors
 *
 * Tool executors are responsible for:
 * 1. Managing a pool of concurrent tool executions
 * 2. Tracking execution status and results
 * 3. Providing idempotency (avoiding duplicate executions)
 */
export interface ToolExecutorProtocol {
    // ---- Lifecycle ----

    /**
     * Initialize executor resources
     */
    start(): Promise<void>;

    /**
     * Shutdown executor and optionally wait for running tasks
     *
     * @param options.wait - Whether to wait for running tasks to complete
     */
    shutdown(options?: { wait?: boolean }): Promise<void>;

    // ---- Execution ----

    /**
     * Submit a tool call for background execution (non-blocking)
     *
     * @param toolcall - The tool call to execute
     */
    submit(toolcall: GeneratedToolcallProtocol): Promise<void>;

    /**
     * Submit multiple tool calls
     *
     * @param toolcalls - Tool calls to execute
     * @param options.parallel - Whether to execute in parallel (default: true)
     */
    submitMany(
        toolcalls: Iterable<GeneratedToolcallProtocol>,
        options?: { parallel?: boolean }
    ): Promise<void>;

    // ---- Observation ----

    /**
     * Observe finished executions
     *
     * @param options.wait - Whether to wait for results
     * @param options.timeout - Timeout in seconds
     * @param options.maxItems - Maximum number of items to return
     * @returns List of executed tool calls
     */
    observe(options?: {
        wait?: boolean;
        timeout?: number;
        maxItems?: number;
    }): Promise<ExecutedToolcallProtocol[]>;

    /**
     * Wait until all submitted tool calls are finished
     */
    waitAll(): Promise<void>;

    // ---- Status ----

    /**
     * Return executor runtime status
     */
    status(): ExecutorStatus;

    /**
     * Clear finished execution results
     */
    clear(): void;
}

/**
 * Helper function to create a GeneratedToolcallProtocol from basic info
 */
export function createGeneratedToolcall(options: {
    toolName: string;
    toolArguments: Record<string, any>;
    toolCallId?: string;
    source?: ToolcallSource;
    rawContentFromLlm?: string;
}): GeneratedToolcallProtocol {
    const toolCallId = options.toolCallId || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return {
        toolName: options.toolName,
        toolArguments: options.toolArguments,
        toolCallId,
        source: options.source || 'chat',
        isSuccess: true,
        rawContentFromLlm: options.rawContentFromLlm,
        idempotencyKey: `${options.toolName}-${JSON.stringify(options.toolArguments)}-${toolCallId}`,
    };
}

/**
 * Helper function to create an ExecutedToolcallProtocol
 */
export function createExecutedToolcall(
    metadata: GeneratedToolcallProtocol,
    isSuccess: boolean,
    result: any
): ExecutedToolcallProtocol {
    return {
        metadata,
        isSuccess,
        result,
    };
}
