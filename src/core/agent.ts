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
// IMPORTANT: Import from "../tools" to trigger tool registration via decorators
// Now using TypeScript-native decorator system
import { SystemToolStore, FunctionCallingStore, registerAgentAsTool } from '../tools';
import { Toolcall } from '../schemas/toolCall';
import { extractToolcallsFromStr } from '../utils/toolUtil';
import { ModelConfig, ModelResponse, PostProcessor, ToolSchema } from '../types';
import { Message as MemoryMessage } from '../schemas/message';
import { TOOLS_PROMPT, OUTPUT_FORMAT_PROMPT } from '../prompts/tools';
import { logger } from '../utils';
import { AgentConfig } from './agentConfig';
import { LocalToolExecutor, createGeneratedToolcall, GeneratedToolcallProtocol, ToolExecutorProtocol } from '../runtime/executors';
import { SKILLS_DIR } from '../configs/paths';
import { areadImage } from '../utils/readImage';
import { ChatCompletionFunctionTool } from 'openai/resources/index';

/**
 * Main Agent class
 */
export class Agent {
    name: string;
    private profile: string;
    private system: string;
    private tools: string[];
    private functionCallingTools: any[] = [];
    private mcpTools: any[] = [];
    private mcpServerNames: string[];
    private useMcp: boolean;
    private modelConfig: string | ModelConfig;
    private verbose: boolean | number;
    private model: Model;
    private history: MessageHistory;
    private subAgents: any[] = [];
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
            // New parameters from Python 0.2.2
            agentId,
            workspaceDir = '',
            executor,
            autoShutdownExecutor = false,
            parallelExecution = false,
            observeTimeout = 60.0,
            skills = [],
        } = config;

        // Identity and presentation
        this.name = name;
        this.profile = profile;
        this.verbose = verbose;
        this.agentId = agentId || uuidv4();

        // Model
        // Support both modelConfig (legacy) and udfModelName (new)
        this.modelConfig = udfModelName || modelConfig || 'deepseek';
        this.model = new Model(this.modelConfig);

        // Tools and orchestration behaviors
        this.subAgents = subAgents || [];
        this.useFunctionCalling = useFunctionCalling;
        this.mcpServerNames = mcpServerNames;
        this.useMcp = this.mcpServerNames.length > 0;
        const agentToolNames = registerAgentAsTool(this.subAgents, Boolean(this.verbose));
        this.tools = [...tools, ...agentToolNames];
        // Build function calling tools regardless of flag, then enable by flag at runtime
        this.functionCallingTools = this.setFunctionCallingTools(this.tools);

        // Execution and runtime controls
        this.postProcessor = postProcessor;
        this.executor = executor || new LocalToolExecutor(5, [SystemToolStore as any, FunctionCallingStore as any]);
        this.autoShutdownExecutor = autoShutdownExecutor;
        this.parallelExecution = parallelExecution;
        this.observeTimeout = observeTimeout;

        // Workspace and prompt context
        this.workspaceDir = workspaceDir ? path.resolve(workspaceDir) : '';
        if (this.workspaceDir && !fs.existsSync(this.workspaceDir)) {
            fs.mkdirSync(this.workspaceDir, { recursive: true });
            logger.debug(`Created workspace directory for agent ${this.name}: ${this.workspaceDir}`);
        }
        const systemPrompt = system || profile || '';
        this.skills = skills;
        this.system = this.buildSystemPrompt(systemPrompt, this.tools, this.workspaceDir || undefined, this.skills);

        // Conversation state
        const modelNameForHistory = typeof this.modelConfig === 'string' ? this.modelConfig : this.modelConfig.model || 'deepseek';
        this.history = new MessageHistory(modelNameForHistory, this.system, this.model.getConfig().contextWindowTokens);

        // Inject workspace hint into chat history (same as Python)
        if (this.workspaceDir) {
            this.history.addMessage('user', `Your workspace directory is: ${this.workspaceDir}`);
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
    private buildSystemPrompt(
        system: string,
        tools: string[],
        workspaceDir?: string,
        skills?: string[]
    ): string {
        let toolDescriptions = '';

        for (const tool of tools) {
            if (!SystemToolStore.hasTool(tool)) {
                logger.warn(`Tool ${tool} not registered in SystemToolStore.`);
            } else {
                const toolDesc = SystemToolStore.getTool(tool);
                toolDescriptions += '\n' + (toolDesc?.desc || '');
            }
        }

        if (tools.length > 0) {
            system =
                system +
                '\n' +
                TOOLS_PROMPT.replace('{available_tools}', tools.map(t => `- ${t}`).join('\n'))
                    .replace('{desc_of_tools}', toolDescriptions)
                    .replace('{output_format}', OUTPUT_FORMAT_PROMPT);
        }

        if (typeof this.verbose === 'number' && this.verbose > 1) {
            logger.debug(`System prompt: ${system}`);
        }

        if (skills && skills.length > 0) {
            const skillDescriptions: string[] = [];
            for (const skillName of skills) {
                const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
                try {
                    if (!fs.existsSync(skillPath)) {
                        logger.warn(`Skill description file not found: ${skillPath}`);
                        continue;
                    }
                    const skillDescription = fs.readFileSync(skillPath, 'utf-8');
                    skillDescriptions.push(
                        `<${skillName}.SkillDescription>${skillDescription}</${skillName}.SkillDescription>`
                    );
                } catch (error) {
                    logger.warn(`Failed to load skill ${skillName}: ${error}`);
                }
            }
            if (skillDescriptions.length > 0) {
                system += `\n--- <SKILLS START> ---\n${skillDescriptions.join('\n-----\n')}\n--- <SKILLS END> ---\n`;
            }
        }

        if (workspaceDir) {
            const absWorkspace = path.resolve(workspaceDir);
            system += `\n\nYour workspace directory is: ${absWorkspace}`;
            system += `\n\n**Note**: your any output files must be saved in ${absWorkspace}`;
        }

        return system;
    }

    /**
     * Set up function calling tools for OpenAI-style function calling
     * @private
     */
    private setFunctionCallingTools(tools: string[]): any[] {
        const openaiToolCalls: ChatCompletionFunctionTool[] = [];

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
    private toGeneratedToolcall(toolcall: Toolcall): GeneratedToolcallProtocol {
        return createGeneratedToolcall({
            toolName: toolcall.name,
            toolArguments: toolcall.input || {},
            toolCallId: toolcall.toolCallId,
            source: toolcall.type === 'user' ? 'function_call' : 'chat',
            rawContentFromLlm: toolcall.rawContentFromLlm,
        });
    }

    private async _agentLoop(): Promise<string> {
        await this.executor?.start();

        while (true) {
            // Truncate history to fit context window (now preserves tool call chains)
            this.history.truncate();

            if (typeof this.verbose === 'number' && this.verbose > 2) {
                logger.debug(
                    `History raw messages before extract toolcall messages:\n ${JSON.stringify(await this.history.formatForApi())}`
                );
            }

            const functionTools: ToolSchema[] = [
                ...(this.useFunctionCalling ? this.functionCallingTools : []),
                ...(this.useMcp ? this.mcpTools : []),
            ];
            // Get response from model
            const response: ModelResponse[] = await this.model.achat(
                await this.history.formatForApi(),
                functionTools.length > 0 ? functionTools : undefined
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
                const generatedToolcalls = allToolCalls.map(tc => this.toGeneratedToolcall(tc));

                await this.executor?.submitMany(generatedToolcalls);
                const observedToolcalls = await this.executor?.observe({ wait: true, timeout: this.observeTimeout });

                for (const obs of observedToolcalls || []) {
                    const metadata = obs.metadata;
                    let executedContent = '';
                    if (obs.result instanceof MemoryMessage) {
                        executedContent = obs.result.content;
                    } else if (typeof obs.result === 'string') {
                        executedContent = obs.result;
                    } else {
                        executedContent = String(obs.result);
                    }

                    const tc = new Toolcall({
                        name: metadata.toolName,
                        input: metadata.toolArguments,
                        toolCallId: metadata.toolCallId,
                        type: metadata.source === 'function_call' ? 'user' : 'system',
                        isExtractedSuccess: metadata.isSuccess,
                        failedExtractedReason: metadata.failedReason,
                        rawContentFromLlm: metadata.rawContentFromLlm,
                        executedState: obs.isSuccess ? 'success' : 'failed',
                        executedContent,
                    });

                    const executedResult = tc.executedResult();
                    if (typeof executedResult === 'string') {
                        this.history.addMessage('user', executedResult);
                    } else {
                        this.history.addMessage(executedResult as any);
                    }
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

    private async _prepareInput(
        instruction: string,
        images?: string | string[]
    ): Promise<void> {
        const imagesList = images ? (Array.isArray(images) ? images : [images]) : [];
        const imageContents = await Promise.all(imagesList.map(img => areadImage(img)));
        const instructionMsg = new MemoryMessage('user', instruction || '');
        instructionMsg.imagesContent = imageContents;
        this.history.addMessage(instructionMsg);
        if (this.verbose) {
            logger.info(`\n[${this.name}] Received: ${instruction}`);
        }
    }

    private async _addMcpTools(): Promise<() => Promise<void>> {
        this.mcpTools = [];
        if (this.mcpServerNames.length === 0 || !FunctionCallingStore.addMcpTools) {
            return async () => { };
        }

        const { schemas, cleanup } = await FunctionCallingStore.addMcpTools(this.name, this.mcpServerNames, 'openai');
        this.mcpTools.push(...schemas);

        if (this.verbose && this.mcpTools.length > 0) {
            logger.info(`[${this.name}] Total loaded MCP tools: ${this.mcpTools.length}.`);
            if (typeof this.verbose === 'number' && this.verbose > 1) {
                logger.info(`[${this.name}] MCP tools sample: ${JSON.stringify(this.mcpTools).substring(0, 200)} ...`);
            }
        }
        return cleanup;
    }

    /**
     * Run the agent with given instruction
     */
    async run(instruction: string = '', images?: string | string[]): Promise<string | any> {
        let cleanupMcpConnections: () => Promise<void> = async () => { };

        try {
            // Add MCP tools if configured
            cleanupMcpConnections = await this._addMcpTools();

            await this._prepareInput(instruction, images);
            const responseText = await this._agentLoop();

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
            const errorText = error instanceof Error ? `${error.message}\n${error.stack || ''}` : String(error);
            const errorLog = `Agent ${this.name} run error: ${errorText}`;
            logger.error(errorLog);
            return errorLog;
        } finally {
            // Cleanup MCP tools
            await cleanupMcpConnections();

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
