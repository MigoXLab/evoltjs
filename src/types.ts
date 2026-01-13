/**
 * Core type definitions for evoltagent
 */

import { PostProcessor } from './hooks';

// Message types
export interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
    images?: string | string[];
    type?: string;
}

export interface ToolCall {
    type: 'system' | 'user';
    extractedResult: () => string;
}

export interface ModelResponse {
    type: 'system' | 'user' | 'TaskCompletion';
    extractedResult: () => string | any[] | Record<string, any>;
    rawContentFromLlm?: string;
}

// Tool types
export interface ToolDescription {
    desc: string;
    execute: (...args: any[]) => Promise<any>;
    argNames: string[];
    serverName?: string;
    inputSchema?: Record<string, any>;
}

export interface ToolStore {
    addTool: (
        name: string,
        desc: string,
        execute: (...args: any[]) => Promise<any>,
        argNames: string[],
        serverName?: string,
        inputSchema?: Record<string, any>
    ) => void;
    addMcpTools: (agentName: string, serverName: string, stack: any) => Promise<void>;
    getMcpToolsSchemas: (agentName: string, serverName: string, provider: string) => any[];
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
}

// Model configuration types
export interface ModelConfig {
    provider: string;
    model: string;
    apiKey: string;
    baseUrl: string;
    contextWindowTokens: number;
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
    stream?: boolean;
    [key: string]: any;
}

// Agent configuration types
export interface AgentConfig {
    name: string;
    profile: string;
    system?: string;
    tools?: string[];
    subAgents?: any[];
    mcpServerNames?: string[];
    modelConfig?: string | ModelConfig;
    verbose?: boolean | number;
    useFunctionCalling?: boolean;
    postProcessor?: PostProcessor;
    toolcallManagerPoolSize?: number;
}

// Environment types
export interface EnvironmentConfig {
    workspace?: string;
    [key: string]: any;
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
