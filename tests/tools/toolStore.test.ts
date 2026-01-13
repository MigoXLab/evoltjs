/**
 * Tests for toolStore module
 */

import { SystemToolStore, FunctionCallingStore } from '../../src/tools/toolStore';

describe('toolStore', () => {
  beforeEach(() => {
    // Reset tool stores before each test
    (SystemToolStore as any).tools = {};
    (FunctionCallingStore as any).tools = {};
  });

  describe('SystemToolStore', () => {
    it('should add and retrieve tools', async () => {
      const mockExecute = async (arg1: string, arg2: number) => `Result: ${arg1} ${arg2}`;

      SystemToolStore.addTool(
        'test.tool',
        'Test tool description',
        mockExecute,
        ['arg1', 'arg2'],
        'test-server'
      );

      const tool = SystemToolStore.getTool('test.tool');
      expect(tool).toBeDefined();
      expect(tool?.desc).toBe('Test tool description');
      expect(tool?.argNames).toEqual(['arg1', 'arg2']);
      expect(tool?.serverName).toBe('test-server');

      // Test execution
      const result = await tool?.execute('hello', 42);
      expect(result).toBe('Result: hello 42');
    });

    it('should check if tool exists', () => {
      SystemToolStore.addTool(
        'test.tool',
        'Test tool description',
        async () => 'result',
        []
      );

      expect(SystemToolStore.hasTool('test.tool')).toBe(true);
      expect(SystemToolStore.hasTool('nonexistent.tool')).toBe(false);
    });

    it('should return tool names', () => {
      SystemToolStore.addTool('tool1', 'Desc1', async () => '1', []);
      SystemToolStore.addTool('tool2', 'Desc2', async () => '2', []);

      const toolNames = SystemToolStore.listTools();
      expect(toolNames).toContain('tool1');
      expect(toolNames).toContain('tool2');
    });
  });

  describe('FunctionCallingStore', () => {
    it('should add tools with input schema', () => {
      const mockExecute = async (param: string) => `Result: ${param}`;

      FunctionCallingStore.addTool(
        'user-tool',
        'User tool description',
        mockExecute,
        ['param'],
        undefined,
        {
          type: 'object',
          properties: {
            param: { type: 'string', description: 'A parameter' }
          },
          required: ['param']
        }
      );

      const tool = FunctionCallingStore.getTool('user-tool');
      expect(tool).toBeDefined();
      expect(tool?.inputSchema).toEqual({
        type: 'object',
        properties: {
          param: { type: 'string', description: 'A parameter' }
        },
        required: ['param']
      });
    });

    it('should convert to OpenAI format', () => {
      FunctionCallingStore.addTool(
        'test-tool',
        'Test tool',
        async (x: string) => x,
        ['x'],
        undefined,
        {
          type: 'object',
          properties: {
            x: { type: 'string', description: 'Input' }
          },
          required: ['x']
        }
      );

      const schemas = FunctionCallingStore.toDict?.('openai');
      expect(schemas).toHaveLength(1);
      expect(schemas?.[0]).toEqual({
        type: 'function',
        function: {
          name: 'test-tool',
          description: 'Test tool',
          parameters: {
            type: 'object',
            properties: {
              x: { type: 'string', description: 'Input' }
            },
            required: ['x']
          }
        }
      });
    });

    it('should handle MCP tools (placeholder)', async () => {
      await expect(
        FunctionCallingStore.addMcpTools?.('test-agent', 'test-server', {})
      ).resolves.not.toThrow();

      const schemas = FunctionCallingStore.getMcpToolsSchemas?.('test-agent', 'test-server', 'openai');
      expect(schemas).toEqual([]);
    });
  });
});