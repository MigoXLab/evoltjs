/**
 * AgentConfig - Configuration interface for Agent
 *
 * Corresponds to Python's core/agent_config.py
 * Separates configuration from business logic.
 */

import { PostProcessor } from '../types';

/**
 * Tool Executor Protocol interface
 * Will be fully defined in runtime/executors
 */
export interface ToolExecutorProtocol {
    start(): Promise<void>;
    shutdown(options?: { wait?: boolean }): Promise<void>;
    submit(toolcall: any): Promise<void>;
    submitMany(toolcalls: Iterable<any>, options?: { parallel?: boolean }): Promise<void>;
    observe(options?: { wait?: boolean; timeout?: number; maxItems?: number }): Promise<any[]>;
    waitAll(): Promise<void>;
    status(): Record<string, any>;
    clear(): void;
}

/**
 * Configuration interface for Agent
 *
 * This interface encapsulates all configuration parameters for an Agent,
 * separating configuration management from business logic.
 */
export interface AgentConfig {
    // ---- Basic configuration ----

    /** Agent identifier for logging and tracking */
    name: string;

    /** Profile of the agent, used as base for system prompt */
    profile: string;

    /** Custom system prompt (overrides profile if provided) */
    system?: string;

    // ---- Workspace / skill / rule / spec (agent-level config) ----

    /** Skill names to load and inject into system prompt */
    skills?: string[];

    /** Paths to rule files for future injection (reserved) */
    rulePaths?: string[];

    /** Spec content or path for future injection (reserved) */
    spec?: string;

    // ---- Tool configuration ----

    /** List of tool names available to the agent */
    tools?: string[];

    /** List of sub-agents that can be called as tools */
    subAgents?: any[];

    /** MCP server names for external tool integration */
    mcpServerNames?: string[];

    /** Whether to use function calling mode */
    useFunctionCalling?: boolean;

    // ---- Model configuration ----

    /**
     * User defined model name, which is the key of models in config.yaml
     * Replaces the legacy modelConfig parameter
     */
    udfModelName?: string;

    /**
     * Legacy model config (string name or ModelConfig object)
     * @deprecated Use udfModelName instead
     */
    modelConfig?: string | any;

    // ---- Runtime configuration ----

    /**
     * Logging verbosity level
     * 0: off, 1: agent messages, 2: all messages
     */
    verbose?: boolean | number;

    /**
     * Execute tool calls in parallel
     * @default false
     */
    parallelExecution?: boolean;

    /**
     * Tool call observation timeout in seconds
     * @default 60.0
     */
    observeTimeout?: number;

    /** Workspace directory for file operations */
    workspaceDir?: string;

    /**
     * Auto-shutdown executor when agent completes
     * Warning: Don't set to true in multi-agent mode as agents share executors
     * @default false
     */
    autoShutdownExecutor?: boolean;

    /**
     * Tool call manager pool size
     * @default 5
     */
    toolcallManagerPoolSize?: number;

    // ---- Optional components (not serialized by default) ----

    /** Post-processor for final output */
    postProcessor?: PostProcessor;

    /** Custom tool executor */
    executor?: ToolExecutorProtocol;

    /** Pre-initialized message history */
    chatHistoryMessage?: any;

    /** Custom agent ID (auto-generated if not provided) */
    agentId?: string;

    /** Few-shot examples */
    fewShot?: string;
}