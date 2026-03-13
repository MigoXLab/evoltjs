import { LocalToolExecutor } from '../../../src/runtime/executors/localExecutor';
import { describe, test, expect } from '@jest/globals';
import { FunctionCallingStore, SystemToolStore } from '../../../src/tools';

describe('LocalToolExecutor Test', () => {
  test('basic execution', async () => {
    const executor = new LocalToolExecutor({ poolSize: 2, toolStores: [SystemToolStore, FunctionCallingStore] });

    try {
      await executor.start();

      executor.submitAndExecute([{ tool_name: 'CommandLineTool.execute', tool_arguments: { command: 'echo basic', cwd: process.cwd() }, tool_call_id: 'tc1', source: 'chat' }]);
      await executor.waitAll();
      const results = await executor.observe();

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('success');
      expect(results[0].content).toContain('echo basic');

      const st = executor.status();
      expect(st.totalSubmitted).toBe(1);
      expect(st.totalObserved).toBe(1);
      expect(st.runningCount).toBe(0);
    } finally {
      await executor.shutdown({ wait: true });
    }
  });

  test('concurrent submission', async () => {
    const executor = new LocalToolExecutor({ poolSize: 3, toolStores: [SystemToolStore, FunctionCallingStore] });
    await executor.start();

    try {
      executor.submitAndExecute(Array.from({ length: 5 }, (_, i) => ({
        tool_name: 'CommandLineTool.execute',
        tool_arguments: { command: `echo task${i}`, cwd: process.cwd() },
        tool_call_id: `tc${i}`,
        source: 'chat' as const,
      })));

      await executor.waitAll();
      const results = await executor.observe();
      expect(results).toHaveLength(5);
      expect(results.every(r => r.status === 'success')).toBe(true);

      const st = executor.status();
      expect(st.totalSubmitted).toBe(5);
      expect(st.totalObserved).toBe(5);
      expect(st.totalFailed).toBe(0);
      expect(st.runningCount).toBe(0);
    } finally {
      await executor.shutdown({ wait: true });
    }
  });

  test('observe timeout', async () => {
    const executor = new LocalToolExecutor({ poolSize: 2, toolStores: [SystemToolStore, FunctionCallingStore], timeout: 1 });
    await executor.start();

    try {
      executor.submitAndExecute([
        { tool_name: 'CommandLineTool.execute', tool_arguments: { command: 'sleep 2', cwd: process.cwd() }, tool_call_id: 'wait1', source: 'chat' },
      ]);

      // With short timeout + long command, first observe may return a running snapshot.
      const firstObserve = await executor.observe();
      expect(firstObserve).toHaveLength(1);
      expect(firstObserve[0].status).toBe('running');
    } finally {
      await executor.shutdown({ wait: true });
    }
  });

  test('observe timeout', async () => {
    const executor = new LocalToolExecutor({ poolSize: 2, toolStores: [SystemToolStore, FunctionCallingStore], timeout: 1 });
    await executor.start();

    try {
      executor.submitAndExecute([
        { tool_name: 'CommandLineTool.execute', tool_arguments: { command: 'sleep 2', cwd: process.cwd() }, tool_call_id: 'wait1', source: 'chat' },
      ]);

      // After task completion, observe should return the final successful result.
      await executor.waitAll();
      const finalObserve = await executor.observe();
      expect(finalObserve).toHaveLength(1);
      expect(finalObserve[0].status).toBe('success');
    } finally {
      await executor.shutdown({ wait: true });
    }
  });

  test('clear observed results', async () => {
    const executor = new LocalToolExecutor({ poolSize: 2, toolStores: [SystemToolStore, FunctionCallingStore] });
    await executor.start();

    try {
      executor.submitAndExecute([
        { tool_name: 'CommandLineTool.execute', tool_arguments: { command: 'echo clear', cwd: process.cwd() }, tool_call_id: 'clear1', source: 'chat' },
      ]);
      await executor.waitAll();
      expect((await executor.observe()).length).toBe(1);
      expect((await executor.observe()).length).toBe(0);

      executor.submitAndExecute([
        { tool_name: 'CommandLineTool.execute', tool_arguments: { command: 'echo clear', cwd: process.cwd() }, tool_call_id: 'clear2', source: 'chat' },
      ]);
      await executor.waitAll();

      executor.clear();
      expect((await executor.observe()).length).toBe(0);
    } finally {
      await executor.shutdown({ wait: true });
    }
  });

  test('cleanup closes background process handles', async () => {
    const executor = new LocalToolExecutor({ poolSize: 1, toolStores: [SystemToolStore, FunctionCallingStore], timeout: 1 });
    await executor.start();

    try {
      executor.submitAndExecute([
        { tool_name: 'CommandLineTool.execute', tool_arguments: { command: 'sleep 2', cwd: process.cwd() }, tool_call_id: 'cleanup1', source: 'chat' },
      ]);

      // Force an early observe timeout so the command stays tracked as a background job.
      const firstObserve = await executor.observe();
      expect(firstObserve).toHaveLength(1);
      expect(firstObserve[0].status).toBe('running');

      const activeJobs = (executor as any)._activeBackgroundJobs as Map<string, any>;
      expect(activeJobs.size).toBeGreaterThan(0);
      const [processId, job] = activeJobs.entries().next().value as [string, any];
      const proc = job.process;

      const cleanupResult = await executor.cleanupBackgroundProcesses();
      expect(cleanupResult).toContain('cleaned up');
      expect(activeJobs.has(processId)).toBe(false);

      // cleanup should terminate the child process at OS level.
      const isAlive = (pid: number | undefined): boolean => {
        if (!pid) return false;
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      };

      for (let i = 0; i < 10 && isAlive(proc.pid); i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      expect(isAlive(proc.pid)).toBe(false);
    } finally {
      await executor.shutdown({ wait: true });
    }
  });
});
