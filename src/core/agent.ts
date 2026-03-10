/**
 * Main Agent class with tool use capabilities
 *
 * Converts Python's core/agent.py to TypeScript
 */

import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { Model, ModelAchatResult } from './model';
import { MessageHistory } from '../runtime/memory';
import { SystemToolStore, FunctionCallingStore, registerAgentAsTool } from '../tools';
import type { ModelConfig, PostProcessor, ToolSchema } from '../types';
import { TOOLS_PROMPT, OUTPUT_FORMAT_PROMPT } from '../prompts/tools';
import { logger } from '../utils';
import { AgentConfig } from './agentConfig';
import { LocalToolExecutor, ToolExecutorProtocol } from '../runtime/executors';
import { SKILLS_DIR } from '../configs/paths';
import { areadImage } from '../utils/readImage';
import { ChatCompletionFunctionTool } from 'openai/resources/index';
import { AssistantMessage, ToolMessage, UserMessage } from '@/schemas/message';

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

    constructor(configInput: AgentConfig) {
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
            toolcallManagerPoolSize = 5,
        } = configInput;

        // Identity and presentation
        this.name = name;
        this.profile = profile;
        this.verbose = verbose;
        this.agentId = agentId || randomUUID();

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
        this.executor = executor || new LocalToolExecutor({
            poolSize: toolcallManagerPoolSize,
            toolStores: [SystemToolStore as any, FunctionCallingStore as any],
            timeout: observeTimeout
        });
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
            this.history.addMessage(new UserMessage({ content: `Your workspace directory is: ${this.workspaceDir}` }));
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

    private async _agentLoop(): Promise<string> {
        await this.executor?.start();

        while (true) {
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
            const { assistantMessage, parsingFailedToolMessages }: ModelAchatResult = await this.model.achat(
                this.history.formatForApi(),
                functionTools.length > 0 ? functionTools : undefined
            );

            this._processResponseIntoHistory([assistantMessage, ...parsingFailedToolMessages]);

            const agentToolCalls = assistantMessage.agent_tool_calls ?? [];
            if (agentToolCalls.length > 0) {
                this.executor?.submitAndExecute(agentToolCalls);
                const observedToolcalls = await this.executor?.observe();
                for (const obs of observedToolcalls || []) {
                    this.history.addMessage(obs);
                }
            } else if (typeof assistantMessage.content === 'string' && assistantMessage.content.trim().length > 0) {
                return assistantMessage.content
                    .replace(/<TaskCompletion>/g, '')
                    .replace(/<\/TaskCompletion>/g, '')
                    .trim();
            } else {
                return '';
            }
        }
    }

    /**
     * Adds system and user toolcall assistant messages from a model response batch into history.
     */
    private _processResponseIntoHistory(response: (AssistantMessage | ToolMessage)[]): void {
        response.forEach(msg => this.history.addMessage(msg));

        if (typeof this.verbose === 'number' && this.verbose > 1) {
            const messages = this.history.formatForApi();
            const last3 = messages.slice(-3);
            logger.debug(`History raw messages after extract toolcall messages (last 3):\n ${JSON.stringify(last3)}`);
        }
        logger.debug(`History usage: ${this.history.formattedContextUsage}`);
    }

    private async _prepareInput(
        instruction: string,
        images?: string | string[]
    ): Promise<void> {
        const imagesList = images ? (Array.isArray(images) ? images : [images]) : [];
        const imageContents = await Promise.all(imagesList.map(img => areadImage(img)));
        const instructionMsg = new UserMessage({ content: [{ type: 'text', text: instruction }, ...imageContents] });

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
     * Set function calling tools
     * Warning: This overwrites existing tools
     */
    setFunctionCallingToolsFlag(useFunctionCalling: boolean): void {
        this.useFunctionCalling = useFunctionCalling;
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
