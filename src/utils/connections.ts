/**
 * Connection utilities for MCP servers
 *
 * Converts Python's connections.py to TypeScript
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { logger } from './index';

/**
 * AsyncExitStack for managing multiple async context managers
 */
export class AsyncExitStack {
    private stack: Array<{
        exit: (exc_type: any, exc_val: any, exc_tb: any) => Promise<void>;
    }> = [];

    /**
     * Enter a context manager and add it to the stack
     */
    async enterContext<T>(context: AsyncContextManager<T>): Promise<T> {
        const result = await context.enter();
        this.stack.push(context);
        return result;
    }

    /**
     * Close all context managers in reverse order
     */
    async close(): Promise<void> {
        while (this.stack.length > 0) {
            const context = this.stack.pop();
            if (context) {
                try {
                    await context.exit(null, null, null);
                } catch (error) {
                    logger.error('Error closing context:', error);
                }
            }
        }
    }

    /**
     * Alias for close to match Python's close method if needed,
     * though Python uses __aexit__ usually.
     */
    async aclose(): Promise<void> {
        await this.close();
    }

    /**
     * Push a callback to be called when closing
     */
    push(callback: () => Promise<void>): void {
        // Convert callback to context manager interface
        const contextManager = {
            enter: async () => {},
            exit: async (exc_type: any, exc_val: any, exc_tb: any): Promise<void> => {
                await callback();
            },
        };
        this.stack.push(contextManager);
    }
}

/**
 * Interface for async context managers
 */
export interface AsyncContextManager<T> {
    enter(): Promise<T>;
    exit(exc_type: any, exc_val: any, exc_tb: any): Promise<void>;
}

/**
 * Base class for MCP server connections
 */
export abstract class MCPConnection implements AsyncContextManager<MCPConnection> {
    session: Client | null = null;
    private transport: Transport | null = null;

    abstract createTransport(): Promise<Transport>;

    async enter(): Promise<MCPConnection> {
        this.transport = await this.createTransport();
        this.session = new Client(
            {
                name: 'evoltagent-client',
                version: '1.0.0',
            },
            {
                capabilities: {
                    // Client capabilities
                },
            }
        );

        // Connect transport
        await this.session.connect(this.transport);

        return this;
    }

    async exit(exc_type: any, exc_val: any, exc_tb: any): Promise<void> {
        try {
            if (this.session) {
                await this.session.close();
            }
        } catch (e) {
            logger.error(`Error during cleanup: ${e}`);
        } finally {
            this.session = null;
            this.transport = null;
        }
    }

    async listTools(): Promise<any[]> {
        if (!this.session) throw new Error('Session not initialized');
        const result = await this.session.listTools();
        return result.tools;
    }

    async callTool(toolName: string, argumentsDict: any): Promise<any> {
        if (!this.session) throw new Error('Session not initialized');
        return await this.session.callTool({
            name: toolName,
            arguments: argumentsDict,
        });
    }
}

/**
 * MCP connection using standard input/output
 */
export class MCPConnectionStdio extends MCPConnection {
    private command: string;
    private args: string[];
    private env: Record<string, string> | undefined;

    constructor(command: string, args: string[] = [], env?: Record<string, string>) {
        super();
        this.command = command;
        this.args = args;
        this.env = env;
    }

    async createTransport(): Promise<Transport> {
        return new StdioClientTransport({
            command: this.command,
            args: this.args,
            env: this.env,
        });
    }
}

/**
 * MCP connection using Server-Sent Events
 */
export class MCPConnectionSSE extends MCPConnection {
    private url: string;
    private headers: Record<string, string> | undefined;

    constructor(url: string, headers?: Record<string, string>) {
        super();
        this.url = url;
        this.headers = headers;
    }

    async createTransport(): Promise<Transport> {
        return new SSEClientTransport(new URL(this.url), {
            eventSourceInit: {
                // headers: this.headers, // TypeScript doesn't like headers in EventSourceInit
            },
        });
    }
}

/**
 * Factory function to create the appropriate MCP connection
 */
export function createMcpConnection(config: any): MCPConnection {
    const connType = (config.type || 'stdio').toLowerCase();

    if (connType === 'stdio') {
        if (!config.command) {
            throw new Error('Command is required for STDIO connections');
        }
        return new MCPConnectionStdio(config.command, config.args || [], config.env);
    } else if (connType === 'sse') {
        if (!config.url) {
            throw new Error('URL is required for SSE connections');
        }
        return new MCPConnectionSSE(config.url, config.headers);
    } else {
        throw new Error(`Unsupported connection type: ${connType}`);
    }
}
