/**
 * MCP Server Configurations
 */

export const MCP_SERVERS_CONFIG: Record<string, any> = {
    playwright: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest'],
    },
    filesystem: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
    },
};
