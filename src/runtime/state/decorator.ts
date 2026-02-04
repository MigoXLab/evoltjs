/**
 * Persistent State Decorator
 *
 * Decorator for automatically persisting state changes after successful
 * function execution.
 *
 * Corresponds to Python's runtime/state/decorator.py
 */

import { logger } from '../../utils';
import { StateRecordType } from './store';
import {
    getAgentName,
    getGlobalStore,
    getOrCreateSessionId,
    setAgentName,
    resetAgentName,
} from './context';

/**
 * Decorator to persist state after successful function execution.
 *
 * This decorator records state changes to the persistence store after
 * the decorated function completes successfully.
 *
 * @param recordType - Type of record to create ("message" or "tool_call")
 *
 * @example
 * ```typescript
 * class MyClass {
 *   @persistentState("message")
 *   async addMessage(message: Message): Promise<void> {
 *     // ... add message logic ...
 *   }
 * }
 * ```
 */
export function persistentState(recordType: StateRecordType) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            // Execute the original function first
            const result = await originalMethod.apply(this, args);

            // Get persistence context
            const sessionId = getOrCreateSessionId();
            const agentName = getAgentName();
            const store = getGlobalStore();

            // Only persist if store is configured and agent_name is set
            if (store !== null && agentName) {
                // Determine actual record type
                let currentType: StateRecordType = recordType;

                // Serialize the data based on type
                const data = _serializeForPersistence(recordType, args, result);

                try {
                    await store.append(sessionId, agentName, {
                        type: currentType,
                        data,
                        timestamp: Date.now() / 1000,
                    });
                    logger.debug(`Persisted ${currentType} record for session=${sessionId}, agent=${agentName}`);
                } catch (error) {
                    // Log but don't fail the operation
                    logger.error(`Failed to persist state: ${error}`);
                }
            }

            return result;
        };

        return descriptor;
    };
}

/**
 * Serialize function arguments/result for persistence.
 */
function _serializeForPersistence(
    recordType: StateRecordType,
    args: any[],
    result: any
): Record<string, any> {
    if (recordType === 'message') {
        // For add_message, serialize the message argument
        const message = args[0];

        if (message !== undefined) {
            if (typeof message.toDict === 'function') {
                return { message: message.toDict() };
            } else if (typeof message.toObject === 'function') {
                return { message: message.toObject() };
            } else if (typeof message === 'object') {
                return { message };
            }
        }

        return { args: String(args) };
    } else if (recordType === 'tool_call') {
        // For submit_many, serialize the toolcalls
        const toolcalls: any[] = [];
        const toolcallsArg = args[0];

        if (toolcallsArg !== undefined && Symbol.iterator in Object(toolcallsArg)) {
            for (const tc of toolcallsArg) {
                if (typeof tc.toDict === 'function') {
                    toolcalls.push(tc.toDict());
                } else if (typeof tc === 'object') {
                    toolcalls.push(tc);
                }
            }
        }

        return { toolcalls };
    }

    return {};
}

/**
 * Decorator to handle session state for Agent.run method.
 *
 * This decorator manages the session lifecycle:
 * 1. Get or create session_id
 * 2. Set agent_name context
 * 3. Try restore from state store (if applicable)
 * 4. On success, record completion event
 *
 * @example
 * ```typescript
 * class Agent {
 *   @agentAutoRestore
 *   async run(instruction: string): Promise<string> {
 *     // ... run logic ...
 *   }
 * }
 * ```
 */
export function agentAutoRestore(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: any, instruction?: string, images?: string | string[]) {
        const inst = instruction || '';

        // Get or create session_id from process-level state
        const sessionId = getOrCreateSessionId();

        // Set agent name for persistence context
        const agentName = this.name;
        setAgentName(agentName);

        try {
            // Call the original run method
            const result = await originalMethod.call(this, inst, images);

            // Record completion event on success
            const store = getGlobalStore();
            if (store !== null && typeof result === 'string') {
                try {
                    await store.append(sessionId, agentName, {
                        type: 'completion',
                        data: { response: result },
                        timestamp: Date.now() / 1000,
                    });
                    logger.debug(`Recorded completion for session=${sessionId}, agent=${agentName}`);
                } catch (error) {
                    logger.error(`Failed to record completion: ${error}`);
                }
            }

            return result;
        } catch (error) {
            logger.error(`Agent ${agentName} run error: ${error}`);
            throw error;
        } finally {
            // Reset agent name context
            resetAgentName();

            // Auto shutdown executor if configured
            if (this.autoShutdownExecutor && this.executor) {
                await this.executor.shutdown({ wait: true });
            }
        }
    };

    return descriptor;
}
