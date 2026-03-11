/**
 * Core type definitions for evoltagent
 */

import type { PostProcessor } from './hooks';

// Tool types
export interface ToolDescription {
    /** Human-readable tool description used in prompts. */
    desc: string;
    /** Tool executor that returns the tool result asynchronously. */
    execute: (...args: any[]) => Promise<any>;
    /** Ordered argument names used to map model inputs to executor args. */
    argNames: string[];
    /** Optional source/server identifier (e.g., class or MCP server name). */
    serverName?: string;
    /** Optional function-calling JSON schema for providers like OpenAI. */
    inputSchema?: Record<string, any>;
}
interface OpenAIToolSchema {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, any>;
    };
}

interface AnthropicToolSchema {
    name: string;
    description: string;
    input_schema: Record<string, any>;
}

export type ToolSchema = Partial<OpenAIToolSchema | AnthropicToolSchema>;

export interface ToolStore {
    addTool: (
        name: string,
        desc: string,
        execute: (...args: any[]) => Promise<any>,
        argNames: string[],
        serverName?: string,
        inputSchema?: Record<string, any>
    ) => void;
    addMcpTools: (
        agentName: string,
        serverNames: string[],
        provider: string
    ) => Promise<{ schemas: ToolSchema[]; cleanup: () => Promise<void> }>;
    getTool: (name: string) => ToolDescription | undefined;
    hasTool: (name: string) => boolean;
    listTools: () => string[];
    toDict?: (provider?: string) => any[];
    contains: (name: string) => boolean;
    getItem: (name: string) => ToolDescription;
    items: () => [string, ToolDescription][];
    keys: () => string[];
    readonly length: number;
    toToolSchema: (name: string, tool: ToolDescription, provider?: string) => any;
    getToolcallSchema: (toolName: string, provider?: string) => any;
    _getInternalToolsMap?: () => Map<string, ToolDescription>;
}

// Model configuration types
export interface ModelConfig {
    // link parameters
    model: string;
    provider: string;
    apiKey: string;
    baseUrl: string;
    // core parameters
    contextWindowTokens: number;
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
    stream?: boolean;
}

// Exception types
export class EvoltError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EvoltError';
    }
}

export class ToolExecutionError extends EvoltError {
    constructor(message: string) {
        super(message);
        this.name = 'ToolExecutionError';
    }
}

export class ModelError extends EvoltError {
    constructor(message: string) {
        super(message);
        this.name = 'ModelError';
    }
}

// Re-export hooks types
export { PostProcessor };
