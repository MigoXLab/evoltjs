/**
 * TypeScript-native tool registration system
 * Uses configuration objects instead of docstring parsing
 */

import { SystemToolStore, FunctionCallingStore } from './toolStore';
import { convertTypeNameToOpenai } from '../configs/configLoader';
import { ToolConfig } from './toolConfig';
import { logger } from '../utils';

/**
 * Build tool description XML from configuration
 */
function buildToolDescription(fullToolName: string, config: ToolConfig[string]): string {
    let toolDesc = `\n<${fullToolName}>\n<${fullToolName}.description> ${config.description}\n`;

    // Add parameters
    if (config.params) {
        for (const param of config.params) {
            toolDesc += `<argument name="${param.name}" type="${param.type}"> ${param.description} </argument>\n`;
        }
    }

    // Add return type
    if (config.returns) {
        toolDesc += `<returns type="${config.returns.type}"> ${config.returns.description} </returns>\n`;
    }

    toolDesc += `</${fullToolName}.description>\n`;

    // Add examples
    if (config.examples && config.examples.length > 0) {
        for (const example of config.examples) {
            toolDesc += `<${fullToolName}.example>\n${example}\n</${fullToolName}.example>\n`;
        }
    }

    toolDesc += `</${fullToolName}>`;
    return toolDesc;
}

/**
 * Build OpenAI input schema from configuration
 */
function buildInputSchema(config: ToolConfig[string]): Record<string, any> {
    const inputSchema = {
        type: 'object',
        properties: {} as Record<string, any>,
        required: [] as string[],
    };

    if (config.params) {
        for (const param of config.params) {
            inputSchema.properties[param.name] = {
                type: convertTypeNameToOpenai(param.type),
                description: param.description,
            };

            if (!param.optional) {
                inputSchema.required.push(param.name);
            }
        }
    }

    return inputSchema;
}

/**
 * Unified tool registration decorator (Python parity)
 * Registers methods to BOTH SystemToolStore and FunctionCallingStore
 *
 * This simplifies tool registration compared to using separate decorators.
 * The decorator automatically handles both XML (system) and OpenAI (user) formats.
 *
 * @param config - Tool configuration with method definitions
 * @returns Class decorator
 *
 * @example
 * ```typescript
 * @tools({
 *   execute: {
 *     description: "Tool description",
 *     params: [{ name: "param1", type: "string", description: "..." }],
 *     returns: { type: "string", description: "..." }
 *   }
 * })
 * export class MyTool {
 *   async execute(param1: string): Promise<string> { ... }
 * }
 * ```
 */
export function tools(config: ToolConfig): ClassDecorator {
    return function (target: any) {
        const instance = new target();

        for (const [methodName, methodConfig] of Object.entries(config)) {
            const method = (instance as any)[methodName];
            if (!method || typeof method !== 'function') {
                throw new Error(`Tool ${target.name}.${methodName} not found`);
            }
            const execute = method.bind(instance);

            const argNames = methodConfig.params?.map(p => p.name) || [];

            // Register to SystemToolStore (XML format: ClassName.methodName)
            const systemToolName = `${target.name}.${methodName}`;
            const systemToolDesc = buildToolDescription(systemToolName, methodConfig);
            SystemToolStore.addTool(systemToolName, systemToolDesc, execute, argNames, target.name);

            // Register to FunctionCallingStore (OpenAI format: ClassName-methodName)
            const userToolName = `${target.name}-${methodName}`;
            const userToolDesc = `\nTool \`${userToolName}\` function is: ${methodConfig.description}\n`;
            const inputSchema = buildInputSchema(methodConfig);
            FunctionCallingStore.addTool(userToolName, userToolDesc, execute, argNames, target.name, inputSchema);

            logger.debug(`Registered unified tool: ${systemToolName} / ${userToolName}`);
        }

        return target;
    };
}

/**
 * Register Agent as tool to SystemToolStore
 */
export function registerAgentAsTool(agents: any, verbose: boolean = false): string[] {
    if (!agents) {
        return [];
    }

    const agentList = Array.isArray(agents) ? agents : [agents];
    const registeredAgentNames: string[] = [];

    for (const agent of agentList) {
        if (!agent || typeof agent !== 'object') {
            logger.warn(`Invalid agent: ${agent}, skipping`);
            continue;
        }

        const agentName = `Agent.${agent.name}`;

        if (SystemToolStore.hasTool(agentName)) {
            logger.debug(`Agent ${agent.name} already registered as ${agentName}, change agent name`);
            registeredAgentNames.push(agentName);
            continue;
        }

        const toolDesc = `Delegate tasks to sub-agent ${agent.name}.
    
    Profile: ${agent.profile}
    
    Args:
        instruction (str): Detailed task description or instruction for the agent. 
                        Be specific about what you want the agent to accomplish.
    
    Returns:
        str: The agent's execution result, including analysis, outputs, or conclusions.
    
    Examples:
        <${agentName}>
            <instruction>
                Please analyze this data and provide insights on trends and patterns.
            </instruction>
        </${agentName}>
    `;

        const agentExecute = async (instruction: string): Promise<string> => {
            try {
                // Agent.run now returns string | any (with post_processor support)
                const response = await (agent as any).run(instruction);

                // Handle string responses (default)
                if (typeof response === 'string') {
                    return response;
                }

                // Handle array responses (legacy ModelResponse[])
                if (Array.isArray(response)) {
                    return response.map(r => String(r)).join('\n');
                }

                // Handle object responses (from post_processor)
                return JSON.stringify(response);
            } catch (error) {
                logger.error(`Error executing agent ${agent.name}:`, error);
                return `Error: ${error instanceof Error ? error.message : String(error)}`;
            }
        };

        SystemToolStore.addTool(agentName, toolDesc, agentExecute, ['instruction'], agent.name);

        registeredAgentNames.push(agentName);
        if (verbose) {
            logger.info(`Registered agent as tool: ${agentName}`);
        }
    }

    if (registeredAgentNames.length > 0) {
        logger.debug(`Successfully registered ${registeredAgentNames.length} Agent tool(s): ${registeredAgentNames.join(', ')}`);
    }

    return registeredAgentNames;
}
