/**
 * Tool storage and management
 *
 * Python Evolt v0.1.5 Parity - Unified ToolStore implementation
 */

import { ToolDescription, ToolStore as IToolStore } from '../types';
import { AsyncExitStack, createMcpConnection, MCPConnection } from '../utils/connections';
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
    private tools: { [key: string]: ToolDescription } = {};

    /**
     * Add a tool to the store
     */
    addTool(
        name: string,
        desc: string,
        execute: (...args: any[]) => Promise<any>,
        argNames: string[],
        serverName?: string,
        inputSchema?: Record<string, any>
    ): void {
        if (name in this.tools) {
            logger.warn(`Tool ${name} already exists in store.`);
            return;
        }

        this.tools[name] = {
            desc,
            execute,
            argNames,
            serverName,
            inputSchema,
        };
    }

    /**
     * Add MCP tools to the store
     */
    async addMcpTools(agentName: string, serverName: string, stack: any): Promise<void> {
        const config = MCP_SERVERS_CONFIG[serverName];

        if (!config) {
            logger.warn(`No MCP server config found for ${serverName}, agent: ${agentName}.`);
            return;
        }

        let numMcpTools = 0;
        try {
            const connection = createMcpConnection(config);

            // Add to stack if provided
            if (stack && typeof stack.enterContext === 'function') {
                await stack.enterContext(connection);
            } else {
                // If no stack provided, just enter context
                // WARNING: This might leak connections if not closed manually
                logger.warn('No AsyncExitStack provided for MCP connection, connection might leak.');
                await connection.enter();
            }

            const toolDefinitions = await connection.listTools();

            for (const toolInfo of toolDefinitions) {
                if (toolInfo && toolInfo.name && toolInfo.inputSchema) {
                    const toolDesc = toolInfo.description || `tool: ${toolInfo.name}`;

                    // Helper to execute tool using the connection
                    const executeFn = async (args: any) => {
                        return await mcpTool(connection, toolInfo.name, args);
                    };

                    // Check if tool already exists and belongs to a different agent
                    const existingTool = this.getTool(toolInfo.name);
                    if (existingTool && (existingTool as any).agentName !== agentName) {
                        // Tool exists but belongs to different agent, skip
                        logger.warn(`Tool ${toolInfo.name} already exists in store for different agent.`);
                        continue;
                    }

                    this.addTool(
                        toolInfo.name,
                        toolDesc,
                        executeFn,
                        [], // Empty argNames implies expecting a single object argument (the dict)
                        serverName,
                        toolInfo.inputSchema
                    );

                    // Store agent name for MCP tools
                    const tool = this.getTool(toolInfo.name);
                    if (tool) {
                        (tool as any).agentName = agentName;
                    }

                    numMcpTools++;
                }
            }

            logger.info(`Loaded ${numMcpTools} MCP tools from ${serverName}, config: ${JSON.stringify(config)}.`);
        } catch (e) {
            logger.error(`Error setting up MCP server ${serverName}, config: ${JSON.stringify(config)}: ${e}`);
        }
    }

    /**
     * Get MCP tools schemas for a specific agent and server
     */
    getMcpToolsSchemas(agentName: string, serverName: string, provider: string): any[] {
        const toolcallSchemas: any[] = [];

        for (const name of this.listTools()) {
            const tool = this.getTool(name);
            if (!tool) continue;

            // Filter by server name if provided
            if (serverName && tool.serverName !== serverName) {
                continue;
            }

            // Filter by agent name for MCP tools
            if ((tool as any).agentName && (tool as any).agentName !== agentName) {
                continue;
            }

            if (tool.inputSchema) {
                toolcallSchemas.push(this.toToolSchema(name, tool, provider));
            }
        }

        return toolcallSchemas;
    }

    /**
     * Convert tool to schema format for specific provider
     */
    toToolSchema(name: string, tool: ToolDescription, provider: string = 'openai'): any {
        if (provider === 'openai') {
            return {
                type: 'function',
                function: {
                    name,
                    description: tool.desc,
                    parameters: tool.inputSchema,
                },
            };
        } else if (provider === 'anthropic') {
            return {
                name,
                description: tool.desc,
                input_schema: tool.inputSchema,
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
        return this.tools[name];
    }

    /**
     * Check if tool exists
     */
    hasTool(name: string): boolean {
        return name in this.tools;
    }

    /**
     * Get all tool names (Python: list_tools)
     */
    listTools(): string[] {
        return Object.keys(this.tools);
    }

    /**
     * Convert all tools to schema format
     */
    toDict(provider: string = 'openai'): any[] {
        const toolSchemas: any[] = [];

        for (const [name, tool] of Object.entries(this.tools)) {
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
        return Object.keys(this.tools).length;
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
        return Object.entries(this.tools);
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
