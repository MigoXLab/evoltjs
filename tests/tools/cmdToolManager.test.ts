
import { ToolcallManager, getCurrentManager } from '../../src/tools/toolcallManager';
import { Toolcall } from '../../src/utils/toolUtil';
import { ToolStore } from '../../src/types';

describe('ToolcallManager Context', () => {
  // Create a mock tool that checks for manager existence
  const mockToolStore: ToolStore = {
    hasTool: (name: string) => name === 'MockTool.checkManager',
    getTool: (name: string) => {
      if (name === 'MockTool.checkManager') {
        return {
          desc: 'Checks if manager is available in context',
          execute: async () => {
            const manager = getCurrentManager();
            if (!manager) {
              throw new Error('Manager not found in context');
            }
            return 'Manager found';
          },
          argNames: []
        };
      }
      return undefined;
    },
    listTools: () => ['MockTool.checkManager'],
    addTool: () => {},
    addMcpTools: async () => {},
    getMcpToolsSchemas: () => [],
    toDict: () => [],
    contains: (name: string) => name === 'MockTool.checkManager',
    getItem: (name: string) => {
      const tool = mockToolStore.getTool(name);
      if (!tool) throw new Error(`Tool ${name} not found`);
      return tool;
    },
    items: () => [],
    keys: () => ['MockTool.checkManager'],
    length: 1,
    toToolSchema: () => ({}),
    getToolcallSchema: () => ({})
  };

  it('should provide manager context to executed tools', async () => {
    const manager = new ToolcallManager(5, [mockToolStore]);
    const toolcall = new Toolcall({
      name: 'MockTool.checkManager',
      input: {},
      isExtractedSuccess: true,
      type: 'system'
    });

    manager.addToolcall(toolcall);
    
    // Execute and observe
    const result = await manager.observe(true, 5.0);
    
    // Verify the result
    // The result format depends on the tool type and implementation
    // For system tools, it usually returns "Toolcall: ... Observation: ..."
    
    expect(result).toBeDefined();
    if (typeof result === 'string') {
        expect(result).toContain('Manager found');
        expect(result).not.toContain('Manager not found in context');
    } else {
        // If it returns an object/array, check content
        const resultStr = JSON.stringify(result);
        expect(resultStr).toContain('Manager found');
    }
  });
});

