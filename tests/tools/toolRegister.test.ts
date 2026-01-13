/**
 * Tests for toolRegister module
 */

import { tools, registerAgentAsTool } from '../../src/tools/toolRegister';
import { SystemToolStore, FunctionCallingStore } from '../../src/tools/toolStore';

describe('toolRegister', () => {
  beforeEach(() => {
    // Reset tool stores before each test
    (SystemToolStore).tools = {};
    (FunctionCallingStore).tools = {};
  });

  describe('@tools unified decorator', () => {
    it('should register tools to both SYSTEM and USER stores', async () => {
      @tools({
        testMethod: {
          description: "Test method description",
          params: [
            { name: "param1", type: "string", description: "First parameter" },
            { name: "param2", type: "number", description: "Second parameter" }
          ],
          returns: { type: "string", description: "The result string" }
        }
      })
      class TestTool {
        async testMethod(param1: string, param2: number): Promise<string> {
          return `Result: ${param1} ${param2}`;
        }
      }

      // Check SystemToolStore registration (ClassName.methodName format)
      const systemTool = (SystemToolStore).getTool('TestTool.testMethod');
      expect(systemTool).toBeDefined();
      expect(systemTool.desc).toContain('Test method description');
      expect(systemTool.argNames).toEqual(['param1', 'param2']);

      // Check FunctionCallingStore registration (ClassName-methodName format)
      const userTool = (FunctionCallingStore).getTool('TestTool-testMethod');
      expect(userTool).toBeDefined();
      expect(userTool.desc).toContain('Test method description');
      expect(userTool.argNames).toEqual(['param1', 'param2']);
      expect(userTool.inputSchema).toBeDefined();

      // Test execution from system store
      const result = await systemTool.execute('hello', 42);
      expect(result).toBe('Result: hello 42');

      // Test execution from user store
      const result2 = await userTool.execute('world', 99);
      expect(result2).toBe('Result: world 99');
    });

    it('should register multiple methods from same class', async () => {
      @tools({
        method1: {
          description: "First method",
          params: [{ name: "x", type: "string", description: "X param" }],
          returns: { type: "string", description: "Result" }
        },
        method2: {
          description: "Second method",
          params: [{ name: "y", type: "number", description: "Y param" }],
          returns: { type: "number", description: "Result" }
        }
      })
      class MultiMethodTool {
        async method1(x: string): Promise<string> {
          return `M1: ${x}`;
        }
        async method2(y: number): Promise<number> {
          return y * 2;
        }
      }

      const tool1 = (SystemToolStore).getTool('MultiMethodTool.method1');
      const tool2 = (SystemToolStore).getTool('MultiMethodTool.method2');

      expect(tool1).toBeDefined();
      expect(tool2).toBeDefined();

      expect(await tool1.execute('test')).toBe('M1: test');
      expect(await tool2.execute(5)).toBe(10);
    });

    it('should throw error for missing tool method', () => {
      expect(() => {
        @tools({
          nonexistentMethod: {
            description: "Method that doesn't exist",
            params: [],
            returns: { type: "string", description: "Result" }
          }
        })
        class TestTool {
          // No method with that name
        }
      }).toThrow('Tool TestTool.nonexistentMethod not found');
    });
  });

  describe('registerAgentAsTool', () => {
    it('should register agent as tool in SystemToolStore', () => {
      const mockAgent = {
        name: 'TestAgent',
        profile: 'A test agent for testing',
        run: jest.fn().mockResolvedValue('Agent response')
      };

      const result = registerAgentAsTool(mockAgent, false);

      expect(result).toEqual(['Agent.TestAgent']);
      const tool = (SystemToolStore).getTool('Agent.TestAgent');
      expect(tool).toBeDefined();
      expect(tool.desc).toContain('TestAgent');
      expect(tool.desc).toContain('A test agent for testing');
    });

    it('should register multiple agents', () => {
      const agents = [
        { name: 'Agent1', profile: 'First agent', run: jest.fn().mockResolvedValue('Response 1') },
        { name: 'Agent2', profile: 'Second agent', run: jest.fn().mockResolvedValue('Response 2') }
      ];

      const result = registerAgentAsTool(agents, false);

      expect(result).toEqual(['Agent.Agent1', 'Agent.Agent2']);
      expect((SystemToolStore).getTool('Agent.Agent1')).toBeDefined();
      expect((SystemToolStore).getTool('Agent.Agent2')).toBeDefined();
    });

    it('should handle agent.run returning string', async () => {
      const mockAgent = {
        name: 'StringAgent',
        profile: 'Returns string',
        run: jest.fn().mockResolvedValue('String response')
      };

      registerAgentAsTool(mockAgent);
      const tool = (SystemToolStore).getTool('Agent.StringAgent');
      const result = await tool.execute('Test instruction');

      expect(result).toBe('String response');
      expect(mockAgent.run).toHaveBeenCalledWith('Test instruction');
    });

    it('should handle agent.run returning object (from post_processor)', async () => {
      const mockAgent = {
        name: 'ObjectAgent',
        profile: 'Returns object',
        run: jest.fn().mockResolvedValue({ data: 'value', count: 42 })
      };

      registerAgentAsTool(mockAgent);
      const tool = (SystemToolStore).getTool('Agent.ObjectAgent');
      const result = await tool.execute('Test instruction');

      expect(result).toBe('{"data":"value","count":42}');
    });

    it('should handle agent errors gracefully', async () => {
      const mockAgent = {
        name: 'ErrorAgent',
        profile: 'Throws errors',
        run: jest.fn().mockRejectedValue(new Error('Agent failed'))
      };

      registerAgentAsTool(mockAgent);
      const tool = (SystemToolStore).getTool('Agent.ErrorAgent');
      const result = await tool.execute('Test instruction');

      expect(result).toContain('Error: Agent failed');
    });

    it('should skip already registered agents', () => {
      const mockAgent = {
        name: 'DuplicateAgent',
        profile: 'Duplicate test',
        run: jest.fn().mockResolvedValue('Response')
      };

      // Register once
      registerAgentAsTool(mockAgent);
      // Register again
      const result = registerAgentAsTool(mockAgent);

      expect(result).toEqual(['Agent.DuplicateAgent']);
      // Should not throw or re-register
    });

    it('should skip invalid agents', () => {
      const result = registerAgentAsTool([null, undefined, 'not-an-agent'], false);

      expect(result).toEqual([]);
    });
  });
});
