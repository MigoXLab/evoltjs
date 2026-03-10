/**
 * Tool execution utilities
 *
 * Corresponds to Python's runtime/executors/utils.py
 */

import { ToolStore } from '../../types';
import { AgentToolcall } from '../../schemas/toolCall';
import { ToolMessage } from '../../schemas/message';
import { logger } from '../../utils';

/**
 * Execute a single tool call and return a ToolMessage result.
 *
 * Corresponds to Python's _execute_single_tool().
 *
 * @param toolcall  - AgentToolcall to execute
 * @param toolStore - Tool store(s) containing tool implementations
 */
export async function _executeSingleTool(
    toolcall: AgentToolcall,
    toolStore: ToolStore | ToolStore[],
): Promise<ToolMessage> {
    const toolStores = Array.isArray(toolStore) ? toolStore : [toolStore];

    const makeMsg = (content: string, status: 'success' | 'failed'): ToolMessage =>
        new ToolMessage({
            tool_call_id: toolcall.tool_call_id,
            tool_name: toolcall.tool_name,
            content,
            status,
            source: toolcall.source,
        });

    // TaskCompletion pseudo-tool
    if (toolcall.tool_name.toLowerCase() === 'taskcompletion') {
        return makeMsg('The task has been completed.', 'success');
    }

    try {
        for (const ts of toolStores) {
            if (ts.hasTool && ts.hasTool(toolcall.tool_name)) {
                const toolDef = ts.getTool!(toolcall.tool_name);
                if (!toolDef) continue;

                const toolExecute = toolDef.execute;
                if (!toolExecute) {
                    return makeMsg(`Tool '${toolcall.tool_name}' has no execute function`, 'failed');
                }

                const result = await toolExecute(toolcall.tool_arguments);
                return makeMsg(String(result), 'success');
            }
        }

        return makeMsg(
            `Tool '${toolcall.tool_name}' not found in tool_store. Please check the tool name.`,
            'failed',
        );
    } catch (error) {
        const errorMsg = `Error executing tool: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMsg);
        return makeMsg(errorMsg, 'failed');
    }
}

/**
 * Execute multiple tools sequentially, returning ToolMessage results.
 */
export async function executeToolsSequential(
    toolcalls: AgentToolcall[],
    toolStore: ToolStore | ToolStore[],
): Promise<ToolMessage[]> {
    const results: ToolMessage[] = [];
    for (const toolcall of toolcalls) {
        results.push(await _executeSingleTool(toolcall, toolStore));
    }
    return results;
}

/**
 * Execute multiple tools in parallel with a concurrency cap, returning ToolMessage results.
 */
export async function executeToolsParallel(
    toolcalls: AgentToolcall[],
    toolStore: ToolStore | ToolStore[],
    maxConcurrency: number = 5,
): Promise<ToolMessage[]> {
    const results: ToolMessage[] = new Array(toolcalls.length);
    const queue = toolcalls.map((tc, idx) => ({ tc, idx }));
    let running = 0;
    let ptr = 0;

    await new Promise<void>((resolve, reject) => {
        const next = () => {
            while (running < maxConcurrency && ptr < queue.length) {
                const { tc, idx } = queue[ptr++];
                running++;
                _executeSingleTool(tc, toolStore)
                    .then((r) => {
                        results[idx] = r;
                    })
                    .catch(reject)
                    .finally(() => {
                        running--;
                        if (ptr < queue.length) {
                            next();
                        } else if (running === 0) {
                            resolve();
                        }
                    });
            }
            if (running === 0 && ptr >= queue.length) resolve();
        };
        next();
    });

    return results;
}
