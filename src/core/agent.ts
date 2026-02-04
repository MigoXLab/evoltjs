/**
 * Main Agent class with tool use capabilities
 *
 * Converts Python's core/agent.py to TypeScript
 */

import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import { Model } from './model';
import { MessageHistory } from '../runtime/memory';
import { ToolcallManager } from '../tools/toolcallManager';
// IMPORTANT: Import from "../tools" to trigger tool registration via decorators
// Now using TypeScript-native decorator system
import { SystemToolStore, FunctionCallingStore, registerAgentAsTool } from '../tools';
import { AsyncExitStack } from '../utils/connections';
import { Toolcall } from '../schemas/toolCall';
import { extractToolcallsFromStr } from '../utils/toolUtil';
import { ModelConfig, ModelResponse, PostProcessor } from '../types';
import { Message as MemoryMessage } from '../schemas/message';
import { SYSTEM_TOOLS_PROMPT, OUTPUT_FORMAT_PROMPT } from '../prompts/tools';
import { logger } from '../utils';
import { AgentConfig, ToolExecutorProtocol } from './agentConfig';

/**
 * Main Agent class
 */
export class Agent {
    name: string;
    private profile: string;
    private system: string;
    private tools: string[];
    private functionCallingTools: any[] = [];
    private mcpServerNames: string[];
    private modelConfig: string | ModelConfig;
    private verbose: boolean | number;
    private model: Model;
    private history: MessageHistory;
    private subAgents: any[] = [];
    private toolcallManagerPoolSize: number;
    private postProcessor: PostProcessor | null;
    private useFunctionCalling: boolean;

    // New properties from Python 0.2.2
    agentId: string;
    workspaceDir: string;
    executor: ToolExecutorProtocol | null;
    autoShutdownExecutor: boolean;
    private parallelExecution: boolean;
    private observeTimeout: number;
    private skills: string[];

    constructor(config: AgentConfig) {
        const {
            name,
            profile,
            system,
            tools = [],
            subAgents = [],
            mcpServerNames = [],
            modelConfig,
            udfModelName,
            verbose = false,
            useFunctionCalling = false,
            postProcessor = null,
            toolcallManagerPoolSize = 5,
            // New parameters from Python 0.2.2
            agentId,
            workspaceDir = '',
            executor = null,
            autoShutdownExecutor = false,
            parallelExecution = false,
            observeTimeout = 60.0,
            skills = [],
        } = config;

        this.name = name;
        this.profile = profile;
        this.verbose = verbose;
        // Support both modelConfig (legacy) and udfModelName (new)
        this.modelConfig = udfModelName || modelConfig || 'deepseek';
        this.subAgents = subAgents || [];
        this.postProcessor = postProcessor;
        this.useFunctionCalling = useFunctionCalling;

        // New properties from Python 0.2.2
        this.agentId = agentId || uuidv4();
        this.workspaceDir = workspaceDir ? path.resolve(workspaceDir) : '';
        this.executor = executor;
        this.autoShutdownExecutor = autoShutdownExecutor;
        this.parallelExecution = parallelExecution;
        this.observeTimeout = observeTimeout;
        this.skills = skills;

        // Create workspace directory if specified and doesn't exist
        if (this.workspaceDir && !fs.existsSync(this.workspaceDir)) {
            fs.mkdirSync(this.workspaceDir, { recursive: true });
            logger.debug(`Created workspace directory for agent ${this.name}: ${this.workspaceDir}`);
        }

        // Register sub-agents as tools and merge with provided tools
        const agentToolNames = registerAgentAsTool(this.subAgents, Boolean(this.verbose));
        this.tools = [...tools, ...agentToolNames];
        this.mcpServerNames = mcpServerNames;

        // Set system prompt with tools descriptions (system tools only)
        const systemPrompt = system || profile || '';
        this.system = this.tools.length > 0 ? this.setSystem(systemPrompt, this.tools) : systemPrompt;

        // Initialize model
        this.model = new Model(this.modelConfig);

        // Initialize message history
        const modelNameForHistory = typeof this.modelConfig === 'string' ? this.modelConfig : this.modelConfig.model || 'deepseek';
        this.history = new MessageHistory(modelNameForHistory, this.system, this.model.getConfig().contextWindowTokens);

        // Set up function calling tools if enabled
        if (this.useFunctionCalling) {
            this.functionCallingTools = this.setFunctionCallingTools(this.tools);
        }

        // Debug: Print system prompt when verbose is enabled
        if (this.verbose) {
            logger.info(`\n========== [${this.name}] System Prompt ==========`);
            logger.info(this.system);
            logger.info(`========================================\n`);

            if (typeof this.verbose === 'number' && this.verbose > 1) {
                logger.info(`[${this.name}] Tools: ${this.tools.join(', ')}`);
                logger.info('');
            }
        }
        this.toolcallManagerPoolSize = toolcallManagerPoolSize;
    }

    /**
     * Get the current system prompt
     */
    get systemPrompt(): string {
        return this.system;
    }

    /**
     * Set the system prompt and update history
     */
    set systemPrompt(value: string) {
        this.system = value;
        if (this.history) {
            this.history.updateSystem(value);
        }
    }

    /**
     * Set the system prompt with system tools descriptions
     * @private
     */
    private setSystem(system: string, systemTools: string[]): string {
        let toolDescriptions = '';

        for (const tool of systemTools) {
            if (SystemToolStore.hasTool(tool)) {
                const toolDesc = SystemToolStore.getTool(tool);
                toolDescriptions += (toolDesc?.desc || '') + '\n\n';
            }
        }

        if (systemTools.length > 0) {
            const availableSystemTools = systemTools.map(t => `- ${t}`).join('\n');

            return (
                system +
                '\n' +
                SYSTEM_TOOLS_PROMPT.replace('{availableSystemTools}', availableSystemTools)
                    .replace('{descOfSystemTools}', toolDescriptions)
                    .replace('{outputFormat}', OUTPUT_FORMAT_PROMPT)
            );
        }

        return system;
    }

    /**
     * Set up function calling tools for OpenAI-style function calling
     * @private
     */
    private setFunctionCallingTools(tools: string[]): any[] {
        const openaiToolCalls: any[] = [];

        for (let tool of tools) {
            tool = tool.replace('.', '-'); // OpenAI format

            if (!FunctionCallingStore.hasTool(tool)) {
                logger.warn(`Tool ${tool} not registered in FunctionCallingStore.`);
            } else {
                const toolSchema = FunctionCallingStore.getToolcallSchema(tool, 'openai');
                if (toolSchema && Object.keys(toolSchema).length > 0) {
                    openaiToolCalls.push(toolSchema);
                }
            }
        }

        return openaiToolCalls;
    }

    /**
     * Agent loop - processes user input and handles tool calls
     * @private
     */
    private async _agentLoop(instruction: string, images?: string | string[]): Promise<string> {
        // Create user message
        const instructionMsg = MemoryMessage.fromUserMsg(instruction, images);
        this.history.addMessage(instructionMsg);

        if (this.verbose) {
            logger.info(`\n[${this.name}] Received: ${instruction}`);
        }

        while (true) {
            // Truncate history to fit context window (now preserves tool call chains)
            this.history.truncate();

            if (typeof this.verbose === 'number' && this.verbose > 2) {
                logger.debug(
                    `History raw messages before extract toolcall messages:\n ${JSON.stringify(await this.history.formatForApi())}`
                );
            }

            // Get response from model
            const response: ModelResponse[] = await this.model.achat(
                await this.history.formatForApi(),
                this.useFunctionCalling ? this.functionCallingTools : undefined
            );

            // Extract system toolcall messages
            const systemToolcallResponses = response
                .filter(r => r.type === 'system')
                .map(r => r.extractedResult())
                .filter(r => typeof r === 'string') as string[];

            if (systemToolcallResponses.length > 0) {
                const systemToolcallResponse = systemToolcallResponses.join('\n');
                this.history.addMessage('assistant', systemToolcallResponse);
            }

            // Extract user toolcall messages
            const userToolcallMessages = response.filter(r => r.type === 'user').map(r => r.extractedResult());

            if (userToolcallMessages.length > 0) {
                // Flatten user toolcall messages
                const userToolcallMessagesFlattened: any[] = [];
                for (const item of userToolcallMessages) {
                    if (Array.isArray(item)) {
                        userToolcallMessagesFlattened.push(...item);
                    } else {
                        userToolcallMessagesFlattened.push(item);
                    }
                }

                // Add each toolcall to history (these are assistant messages with tool_calls)
                for (const toolcall of userToolcallMessagesFlattened) {
                    this.history.addMessage(toolcall as any);
                }
            }

            if (typeof this.verbose === 'number' && this.verbose > 1) {
                const messages = await this.history.formatForApi();
                const last3 = messages.slice(-3);
                logger.debug(`History raw messages after extract toolcall messages (last 3):\n ${JSON.stringify(last3)}`);
            }

            logger.debug(`History usage: ${this.history.formattedContextUsage}`);

            // Create toolcall manager
            const toolcallManager = new ToolcallManager(this.toolcallManagerPoolSize, [SystemToolStore, FunctionCallingStore]);

            // Collect and extract all tool calls
            const allToolCalls: Toolcall[] = [];

            // Prepare system tool map for extraction
            const systemToolMap: Record<string, any> = {};
            const systemToolNames = SystemToolStore.listTools();
            for (const name of systemToolNames) {
                const tool = SystemToolStore.getTool(name);
                if (tool) {
                    systemToolMap[name] = tool;
                }
            }

            for (const r of response) {
                const result = r.extractedResult();

                if (typeof result === 'string') {
                    // Extract XML system tool calls
                    if (result.trim().length > 0) {
                        const extracted = extractToolcallsFromStr(result, systemToolMap);
                        allToolCalls.push(...extracted);
                    }
                } else if (typeof result === 'object' && result !== null) {
                    // Handle assistant message with tool_calls (from user/MCP tools)
                    if (!Array.isArray(result) && result.role === 'assistant' && result.tool_calls && Array.isArray(result.tool_calls)) {
                        for (const tc of result.tool_calls) {
                            // OpenAI format: { id, type: 'function', function: { name, arguments } }
                            if (tc.type === 'function' && tc.function) {
                                let args = {};
                                try {
                                    args = JSON.parse(tc.function.arguments);
                                } catch (e) {
                                    logger.warn(`Failed to parse arguments for tool ${tc.function.name}: ${tc.function.arguments}`);
                                    args = { raw_args: tc.function.arguments };
                                }

                                allToolCalls.push(
                                    new Toolcall({
                                        name: tc.function.name,
                                        input: args,
                                        toolCallId: tc.id,
                                        type: 'user',
                                        rawContentFromLlm: tc.function.arguments,
                                    })
                                );
                            }
                        }
                    }
                    // Handle array of tool calls (legacy format)
                    else if (Array.isArray(result)) {
                        for (const item of result) {
                            // OpenAI format: { id, type: 'function', function: { name, arguments } }
                            if (item.type === 'function' && item.function) {
                                let args = {};
                                try {
                                    args = JSON.parse(item.function.arguments);
                                } catch (e) {
                                    logger.warn(`Failed to parse arguments for tool ${item.function.name}: ${item.function.arguments}`);
                                    args = { raw_args: item.function.arguments };
                                }

                                allToolCalls.push(
                                    new Toolcall({
                                        name: item.function.name,
                                        input: args,
                                        toolCallId: item.id,
                                        type: 'user',
                                        rawContentFromLlm: item.function.arguments,
                                    })
                                );
                            }
                            // Anthropic format: { id, type: 'tool_use', name, input }
                            else if (item.type === 'tool_use') {
                                allToolCalls.push(
                                    new Toolcall({
                                        name: item.name,
                                        input: item.input,
                                        toolCallId: item.id,
                                        type: 'user',
                                    })
                                );
                            }
                        }
                    }
                }
            }

            if (allToolCalls.length > 0) {
                toolcallManager.addToolcall(allToolCalls);
                const obs = await toolcallManager.observe(true, 60.0);

                // Handle array of observations (which may include tool messages)
                if (Array.isArray(obs)) {
                    for (const item of obs) {
                        if (typeof item === 'object') {
                            // Direct message object (e.g. tool response)
                            this.history.addMessage(item);
                        } else if (typeof item === 'string') {
                            this.history.addMessage('user', item);
                        }
                    }
                } else if (typeof obs === 'string') {
                    this.history.addMessage('user', obs);
                } else if (typeof obs === 'object') {
                    this.history.addMessage(obs as any);
                } else {
                    logger.warn(`Unknown observation type: ${typeof obs}`);
                }
            } else {
                // No tool calls - extract text from system responses and strip TaskCompletion tags
                for (const r of response) {
                    if (r.type === 'system') {
                        const result = r.extractedResult();
                        if (typeof result === 'string') {
                            // Strip TaskCompletion tags (matching Python behavior)
                            const cleanResult = result
                                .replace(/<TaskCompletion>/g, '')
                                .replace(/<\/TaskCompletion>/g, '')
                                .trim();
                            return cleanResult;
                        }
                    }
                }
                return ''; // No content found
            }
        }
    }

    /**
     * Run the agent with given instruction
     */
    async run(instruction: string, images?: string | string[]): Promise<string | any> {
        // AsyncExitStack for MCP tools management
        const stack = new AsyncExitStack();

        try {
            // Add MCP tools if configured
            for (const serverName of this.mcpServerNames) {
                await FunctionCallingStore.addMcpTools?.(this.name, serverName, stack);
                const mcpTools = FunctionCallingStore.getMcpToolsSchemas?.(this.name, serverName, 'openai') || [];

                if (this.verbose) {
                    logger.info(`[${this.name}] Loaded MCP tools from ${serverName}: ${mcpTools.length} tools found.`);
                    if (typeof this.verbose === 'number' && this.verbose > 1) {
                        logger.info(`[${this.name}] MCP tools sample: ${JSON.stringify(mcpTools).substring(0, 200)} ...`);
                    }
                }

                if (this.useFunctionCalling) {
                    this.functionCallingTools.push(...mcpTools);
                }
            }

            // Run agent loop (now returns string)
            const responseText = await this._agentLoop(instruction, images);

            // Apply post_processor if provided
            if (this.postProcessor) {
                try {
                    return await this.postProcessor(responseText);
                } catch (error) {
                    logger.error(`Post-processor error in agent ${this.name}:`, error);
                    throw new Error(`Post-processor failed: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            // Return raw string response
            return responseText;
        } catch (error) {
            logger.error(`Agent ${this.name} execution error:`);
            logger.error(error);
            if (error instanceof Error) {
                logger.error(`Error message: ${error.message}`);
                logger.error(`Error stack: ${error.stack}`);
            }
            throw error;
        } finally {
            // Cleanup MCP tools
            await stack.close();

            // Auto shutdown executor if configured
            if (this.autoShutdownExecutor && this.executor) {
                try {
                    await this.executor.shutdown({ wait: true });
                    logger.debug(`Executor shutdown completed for agent ${this.name}`);
                } catch (error) {
                    logger.warn(`Error during executor shutdown: ${error}`);
                }
            }
        }
    }

    /**
     * Get agent profile
     */
    getProfile(): string {
        return this.profile;
    }

    /**
     * Get tools
     */
    getTools(): string[] {
        return [...this.tools];
    }

    /**
     * Get function calling tools schemas
     */
    getFunctionCallingTools(): any[] {
        return [...this.functionCallingTools];
    }

    /**
     * Get MCP server names
     */
    getMcpServerNames(): string[] {
        return [...this.mcpServerNames];
    }

    /**
     * Get model config (string or ModelConfig object)
     */
    getModelConfig(): string | ModelConfig {
        return this.modelConfig;
    }

    /**
     * Get model name (for backward compatibility)
     */
    getModelName(): string {
        if (typeof this.modelConfig === 'string') {
            return this.modelConfig;
        }
        return this.modelConfig.model || 'deepseek';
    }

    /**
     * Get verbose setting
     */
    getVerbose(): boolean | number {
        return this.verbose;
    }

    /**
     * Get sub-agents
     */
    getSubAgents(): any[] {
        return [...this.subAgents];
    }

    /**
     * Get agent ID
     */
    getAgentId(): string {
        return this.agentId;
    }

    /**
     * Get workspace directory
     */
    getWorkspaceDir(): string {
        return this.workspaceDir;
    }

    /**
     * Get parallel execution setting
     */
    getParallelExecution(): boolean {
        return this.parallelExecution;
    }

    /**
     * Get observe timeout setting
     */
    getObserveTimeout(): number {
        return this.observeTimeout;
    }

    /**
     * Get skills
     */
    getSkills(): string[] {
        return [...this.skills];
    }

    /**
     * Get executor
     */
    getExecutor(): ToolExecutorProtocol | null {
        return this.executor;
    }

    /**
     * Set executor
     */
    setExecutor(executor: ToolExecutorProtocol): void {
        this.executor = executor;
    }

    /**
     * Get chat history message
     */
    get chatHistoryMessage(): MessageHistory {
        return this.history;
    }
}
