/**
 * Tool execution utilities
 *
 * Corresponds to Python's runtime/executors/utils.py
 */

import { ToolStore } from '../../types';
import { Message } from '../../schemas/message';
import {
    GeneratedToolcallProtocol,
    ExecutedToolcallProtocol,
    createExecutedToolcall,
} from './base';
import { logger } from '../../utils';

/**
 * Execute a single tool and handle errors
 *
 * @param generatedToolcall - The tool call to execute
 * @param toolStore - Tool store(s) containing the tool implementations
 * @returns Executed tool call result
 */
export async function _executeSingleTool(
    generatedToolcall: GeneratedToolcallProtocol,
    toolStore: ToolStore | ToolStore[]
): Promise<ExecutedToolcallProtocol> {
    // Normalize tool store to array
    const toolStores = Array.isArray(toolStore) ? toolStore : [toolStore];

    // Handle failed tool call extraction
    if (!generatedToolcall.isSuccess) {
        return createExecutedToolcall(
            generatedToolcall,
            false,
            `Tool extraction failed: ${generatedToolcall.failedReason || 'Unknown'}`
        );
    }

    // Handle TaskCompletion pseudo-tool
    if (generatedToolcall.toolName.toLowerCase() === 'taskcompletion') {
        return createExecutedToolcall(
            generatedToolcall,
            true,
            'The task has been completed.'
        );
    }

    try {
        // Find and execute the tool
        for (const ts of toolStores) {
            if (ts.hasTool && ts.hasTool(generatedToolcall.toolName)) {
                const toolDef = ts.getTool!(generatedToolcall.toolName);
                if (!toolDef) {
                    continue;
                }

                // Get the execute function
                const toolExecute = toolDef.execute;
                if (!toolExecute) {
                    return createExecutedToolcall(
                        generatedToolcall,
                        false,
                        `Tool '${generatedToolcall.toolName}' has no execute function`
                    );
                }

                // Execute the tool
                const result = await toolExecute(generatedToolcall.toolArguments);

                // Convert result to string if not already a Message
                const resultValue = result instanceof Message ? result : String(result);

                return createExecutedToolcall(
                    generatedToolcall,
                    true,
                    resultValue
                );
            }
        }

        // Tool not found
        return createExecutedToolcall(
            generatedToolcall,
            false,
            `Tool '${generatedToolcall.toolName}' not found in tool_store. Please check the tool name.`
        );
    } catch (error) {
        const errorMsg = `Error executing tool: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMsg);
        return createExecutedToolcall(
            generatedToolcall,
            false,
            errorMsg
        );
    }
}

/**
 * Execute multiple tools sequentially
 *
 * @param toolcalls - Tool calls to execute
 * @param toolStore - Tool store(s) containing the tool implementations
 * @returns Array of executed tool call results
 */
export async function executeToolsSequential(
    toolcalls: GeneratedToolcallProtocol[],
    toolStore: ToolStore | ToolStore[]
): Promise<ExecutedToolcallProtocol[]> {
    const results: ExecutedToolcallProtocol[] = [];

    for (const toolcall of toolcalls) {
        const result = await _executeSingleTool(toolcall, toolStore);
        results.push(result);
    }

    return results;
}

/**
 * Execute multiple tools in parallel
 *
 * @param toolcalls - Tool calls to execute
 * @param toolStore - Tool store(s) containing the tool implementations
 * @param maxConcurrency - Maximum concurrent executions (default: 5)
 * @returns Array of executed tool call results
 */
export async function executeToolsParallel(
    toolcalls: GeneratedToolcallProtocol[],
    toolStore: ToolStore | ToolStore[],
    maxConcurrency: number = 5
): Promise<ExecutedToolcallProtocol[]> {
    const results: ExecutedToolcallProtocol[] = [];
    const pending: Promise<void>[] = [];
    let runningCount = 0;

    for (const toolcall of toolcalls) {
        // Wait if we're at max concurrency
        while (runningCount >= maxConcurrency) {
            await Promise.race(pending);
        }

        runningCount++;
        const promise = (async () => {
            try {
                const result = await _executeSingleTool(toolcall, toolStore);
                results.push(result);
            } finally {
                runningCount--;
            }
        })();

        pending.push(promise);
    }

    // Wait for all remaining tasks
    await Promise.all(pending);

    return results;
}
