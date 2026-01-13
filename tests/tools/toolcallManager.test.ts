/**
 * Tests for ToolcallManager
 */

import { ToolcallManager } from '../../src/tools/toolcallManager';
import { Toolcall } from '../../src/utils/toolUtil';
import { SystemToolStore, FunctionCallingStore } from '../../src/tools/toolStore';

describe('ToolcallManager', () => {
  describe('Initialization', () => {
    it('should initialize with default pool size', () => {
      const manager = new ToolcallManager();
      expect(manager).toBeInstanceOf(ToolcallManager);
    });

    it('should initialize with custom pool size', () => {
      const manager = new ToolcallManager(10);
      expect(manager).toBeInstanceOf(ToolcallManager);
    });

    it('should initialize with tool stores', () => {
      const manager = new ToolcallManager(5, [SystemToolStore, FunctionCallingStore]);
      expect(manager).toBeInstanceOf(ToolcallManager);
    });
  });

  describe('Toolcall Management', () => {
    it('should add single toolcall', () => {
      const manager = new ToolcallManager(5, [SystemToolStore]);
      const toolcall = new Toolcall({ name: 'test.tool', input: { arg1: 'value1' } });
      
      manager.addToolcall(toolcall);
      expect(manager.getPendingCount()).toBe(1);
    });

    it('should add multiple toolcalls', () => {
      const manager = new ToolcallManager(5, [SystemToolStore]);
      const toolcalls = [
        new Toolcall({ name: 'tool1', input: {} }),
        new Toolcall({ name: 'tool2', input: {} })
      ];
      
      manager.addToolcall(toolcalls);
      expect(manager.getPendingCount()).toBe(2);
    });

    it('should clear toolcalls', () => {
      const manager = new ToolcallManager(5, [SystemToolStore]);
      const toolcall = new Toolcall({ name: 'test.tool', input: {} });
      
      manager.addToolcall(toolcall);
      expect(manager.getPendingCount()).toBe(1);
      
      manager.clear();
      expect(manager.getPendingCount()).toBe(0);
    });
  });

  describe('Tool Execution', () => {
    it('should execute toolcalls and return results', async () => {
      const manager = new ToolcallManager(5, [SystemToolStore]);
      const toolcall = new Toolcall({ 
        name: 'test.tool', 
        input: { arg1: 'value1' },
        isExtractedSuccess: true
      });
      
      manager.addToolcall(toolcall);
      const result = await manager.observe(true, 1.0);
      
      expect(result).toBeDefined();
    });

    it('should handle failed tool extraction', async () => {
      const manager = new ToolcallManager(5, [SystemToolStore]);
      const toolcall = new Toolcall({ 
        name: 'test.tool', 
        input: {},
        isExtractedSuccess: false,
        failedExtractedReason: 'Extraction failed'
      });
      
      manager.addToolcall(toolcall);
      const result = await manager.observe(true, 1.0);
      
      expect(result).toBeDefined();
    });

    it('should handle unknown tools', async () => {
      const manager = new ToolcallManager(5, [SystemToolStore]);
      const toolcall = new Toolcall({ 
        name: 'unknown.tool', 
        input: {},
        isExtractedSuccess: true
      });
      
      manager.addToolcall(toolcall);
      const result = await manager.observe(true, 1.0);
      
      expect(result).toBeDefined();
    });
  });

  describe('Status Management', () => {
    it('should return correct status', () => {
      const manager = new ToolcallManager(5, [SystemToolStore]);
      const toolcall = new Toolcall({ name: 'test.tool', input: {} });
      
      manager.addToolcall(toolcall);
      const status = manager.getStatus();
      
      expect(status).toHaveProperty('pool_size', 5);
      expect(status).toHaveProperty('pending', 1);
      expect(status).toHaveProperty('done', 0);
      expect(status).toHaveProperty('failed', 0);
    });

    it('should wait for all tasks', async () => {
      const manager = new ToolcallManager(5, [SystemToolStore]);
      const toolcall = new Toolcall({ 
        name: 'test.tool', 
        input: {},
        isExtractedSuccess: true
      });
      
      manager.addToolcall(toolcall);
      
      // Execute the task first
      await manager.execute();
      
      // Then wait for all tasks to complete
      await manager.waitAll();
      
      // After waiting, pending should be 0 and tasks should be empty
      expect(manager.getPendingCount()).toBe(0);
      expect(manager.getStatus().running_tasks).toBe(0);
    });
  });

  describe('Background Process Management', () => {
    it('should list background processes', () => {
      const manager = new ToolcallManager(5, [SystemToolStore]);
      const [status, message] = manager.listBackgroundProcesses();
      
      expect(status).toBe('idle');
      expect(message).toContain('当前没有运行的后台进程');
    });

    it('should cleanup background processes', async () => {
      const manager = new ToolcallManager(5, [SystemToolStore]);
      const result = await manager.cleanupBackgroundProcesses();
      
      expect(result).toContain('没有需要清理的后台进程');
    });
  });
});