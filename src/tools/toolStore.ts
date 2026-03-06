/**
 * Tool storage and management
 *
 * Python Evolt v0.1.5 Parity - Unified ToolStore implementation
 */

import { ToolDescription, ToolStore as IToolStore, ToolSchema } from '../types';
import { createMcpConnection, MCPConnection } from '../utils/connections';
import { MCP_SERVERS_CONFIG } from '../configs';
import { logger } from '../utils';

/**
 * Helper function to execute MCP tool
 */
async function mcpTool(connection: MCPConnection, toolName: string, args: any): Promise<string> {
    try {
        // Ensure args is an object
        const argumentsDict = typeof args === 'object' ? args : {};

        const result = await connection.callTool(toolName, argumentsDict);

        if (result && result.content) {
            for (const item of result.content) {
                if (item.type === 'text') {
                    return item.text;
                }
            }
        }

        return 'No text content in tool response';
    } catch (e) {
        return `Error executing ${toolName}: ${e}`;
    }
}

/**
 * Unified ToolStore class (Python v0.1.5 parity)
 *
 * Replaces separate SystemToolStore and UserToolStore classes.
 * Both SYSTEM_TOOLSTORE and FUNCTION_CALLING_STORE are instances of this class.
 */
class ToolStore implements IToolStore {
    private tools: Map<string, ToolDescription> = new Map();

    /**
     * Internal access to tools for testing only
     */
    _getInternalToolsMap(): Map<string, ToolDescription> {
        return this.tools;
    }
    addTool(
        name: string,
        desc: string,
        execute: (...args: any[]) => Promise<any>,
        argNames: string[],
        serverName?: string,
        inputSchema?: Record<string, any>
    ): void {
        if (this.tools.has(name)) {
            logger.warn(`Tool ${name} already exists in store.`);
            return;
        }

        this.tools.set(name, {
            desc,
            execute,
            argNames,
            serverName,
            inputSchema,
        });
    }

    /**
     * Register MCP tools from multiple servers and return schemas/cleanup
     */
    async addMcpTools(
        agentName: string,
        serverNames: string[],
        provider: string
    ): Promise<{ schemas: ToolSchema[]; cleanup: () => Promise<void> }> {
        const cleanupTasks: Array<() => Promise<void>> = [];
        const cleanup = async (): Promise<void> => {
            if (cleanupTasks.length === 0) {
                return;
            }
            const tasks = cleanupTasks.splice(0, cleanupTasks.length);
            const settledResults = await Promise.allSettled(tasks.map(task => task()));
            for (const result of settledResults) {
                if (result.status === 'rejected') {
                    logger.warn(`Error during MCP cleanup for agent ${agentName}: ${result.reason}`);
                }
            }
        };

        const registerSingleServer = async (serverName: string): Promise<ToolSchema[]> => {
            const config = MCP_SERVERS_CONFIG[serverName];
            if (!config) {
                throw new Error(`No MCP server config found for ${serverName}, agent: ${agentName}.`);
            }

            const connection = createMcpConnection(config);
            await connection.enter();
            cleanupTasks.push(async () => {
                await connection.exit();
            });

            const toolDefinitions = await connection.listTools();
            const serverSchemas: ToolSchema[] = [];
            let numMcpTools = 0;

            for (const toolInfo of toolDefinitions) {
                if (!toolInfo || !toolInfo.name || !toolInfo.inputSchema) {
                    continue;
                }

                const rawToolName = toolInfo.name;
                const namespacedToolName = `${serverName}-${rawToolName}`;
                const toolDesc = toolInfo.description || `tool: ${rawToolName}`;

                const executeFn = async (args: any) => {
                    return await mcpTool(connection, rawToolName, args);
                };

                if (this.tools.has(namespacedToolName)) {
                    logger.warn(`Tool ${namespacedToolName} already exists in store, replacing with latest connection.`);
                    this.tools.delete(namespacedToolName);
                }

                this.addTool(
                    namespacedToolName,
                    toolDesc,
                    executeFn,
                    [],
                    serverName,
                    toolInfo.inputSchema
                );

                const registeredTool = this.getTool(namespacedToolName);
                if (registeredTool?.inputSchema) {
                    serverSchemas.push(this.toToolSchema(namespacedToolName, registeredTool, provider));
                }
                numMcpTools++;
            }

            logger.info(
                `[${agentName}] Loaded MCP tools from ${serverName}: ${numMcpTools} tools found, config: ${JSON.stringify(config)}.`
            );
            return serverSchemas;
        };

        const registerPromises = serverNames.map(serverName => registerSingleServer(serverName));
        try {
            const schemasByServer = await Promise.all(registerPromises);
            return { schemas: schemasByServer.flat(), cleanup };
        } catch (error) {
            await Promise.allSettled(registerPromises);
            await cleanup();
            throw error;
        }
    }

    /**
     * Convert tool to schema format for specific provider
     */
    toToolSchema(name: string, tool: ToolDescription, provider: string = 'openai'): ToolSchema {
        if (provider === 'openai') {
            return {
                type: 'function',
                function: {
                    name,
                    description: tool.desc,
                    parameters: tool.inputSchema || {},
                },
            };
        } else if (provider === 'anthropic') {
            return {
                name,
                description: tool.desc,
                input_schema: tool.inputSchema || {},
            };
        }
        return {};
    }

    /**
     * Get tool schema by name (Python: get_toolcall_schema)
     */
    getToolcallSchema(toolName: string, provider: string = 'openai'): any {
        const tool = this.getTool(toolName);
        if (!tool) {
            return {};
        }
        return this.toToolSchema(toolName, tool, provider);
    }

    /**
     * Get tool by name
     */
    getTool(name: string): ToolDescription | undefined {
        return this.tools.get(name);
    }

    /**
     * Check if tool exists
     */
    hasTool(name: string): boolean {
        return this.tools.has(name);
    }

    /**
     * Get all tool names (Python: list_tools)
     */
    listTools(): string[] {
        return Array.from(this.tools.keys());
    }

    /**
     * Convert all tools to schema format
     */
    toDict(provider: string = 'openai'): any[] {
        const toolSchemas: any[] = [];

        for (const [name, tool] of this.tools.entries()) {
            if (tool.inputSchema) {
                toolSchemas.push(this.toToolSchema(name, tool, provider));
            }
        }

        return toolSchemas;
    }

    /**
     * Get number of tools in store
     */
    get length(): number {
        return this.tools.size;
    }

    /**
     * Check if tool exists (Python __contains__ equivalent)
     */
    contains(name: string): boolean {
        return this.hasTool(name);
    }

    /**
     * Get tool by index operator (Python __getitem__ equivalent)
     */
    getItem(name: string): ToolDescription {
        const tool = this.getTool(name);
        if (!tool) {
            throw new Error(`Tool ${name} not found in store.`);
        }
        return tool;
    }

    /**
     * Get all tool entries
     */
    items(): [string, ToolDescription][] {
        return Array.from(this.tools.entries());
    }

    /**
     * Get all tool names (alias for listTools)
     */
    keys(): string[] {
        return this.listTools();
    }
}

// Global tool store instances (Python v0.1.5 parity)
// Phase 6: Renamed from UPPER_CASE to PascalCase for TypeScript convention
export const SystemToolStore: IToolStore = new ToolStore();
export const FunctionCallingStore: IToolStore = new ToolStore();

/**
 * @deprecated Use FunctionCallingStore instead. This alias will be removed in v2.0.0
 */
export const UserToolStore: IToolStore = FunctionCallingStore;
