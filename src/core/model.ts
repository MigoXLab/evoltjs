/**
 * Model abstraction layer using official SDKs
 *
 * Provides a unified interface for multiple LLM providers:
 * - OpenAI (and compatible APIs like DeepSeek)
 * - Anthropic Claude
 * - Google Gemini
 */

import { ModelConfig, ModelError, ToolSchema } from '../types';
import { loadModelConfig } from '../configs/configLoader';
import OpenAI from 'openai';
import type { ChatCompletionAssistantMessageParam, ChatCompletionMessageFunctionToolCall, ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger, streamLogger } from '../utils';
import { AssistantMessage, AssistantMessageParams, ToolMessage } from '@/schemas/message';
import { AgentToolcall } from '@/schemas/toolCall';
import { extractToolcallsFromStr } from '@/utils/toolUtil';
import { SystemToolStore } from '@/tools';

/**
 * Model call result with assistant output and parsing failures.
 */
export interface ModelAchatResult {
    assistantMessage: AssistantMessage;
    parsingFailedToolMessages: ToolMessage[];
}

/**
 * Model class for interacting with LLM providers
 * Uses official SDKs for better reliability and type safety
 */
export class Model {
    private config: ModelConfig;
    private maxEmptyRetries: number;
    private openaiClient?: OpenAI;
    private anthropicClient?: Anthropic;
    private geminiClient?: GoogleGenerativeAI;

    constructor(model?: string | ModelConfig, maxEmptyRetries?: number) {
        if (typeof model === 'string' || model === undefined) {
            this.config = loadModelConfig(model || 'deepseek');
        } else {
            // model is ModelConfig object
            this.config = model;
        }
        this.maxEmptyRetries = maxEmptyRetries ?? 3;

        // Initialize the appropriate client based on provider
        this._initializeClient();
    }

    /**
     * Initialize the appropriate SDK client based on provider
     */
    private _initializeClient(): void {
        const provider = this.config.provider.toLowerCase();

        switch (provider) {
            case 'openai':
            case 'anthropic':
                this.openaiClient = new OpenAI({
                    apiKey: this.config.apiKey || process.env.OPENAI_API_KEY,
                    baseURL: this.config.baseUrl,
                    timeout: 60000,
                });
                break;

            case 'deepseek':
                // DeepSeek uses OpenAI-compatible API
                this.openaiClient = new OpenAI({
                    apiKey: this.config.apiKey || process.env.DEEPSEEK_API_KEY,
                    baseURL: this.config.baseUrl || 'https://api.deepseek.com',
                    timeout: 60000,
                });
                break;

            case 'gemini':
                const apiKey = this.config.apiKey || process.env.GEMINI_API_KEY || '';
                this.geminiClient = new GoogleGenerativeAI(apiKey);
                break;

            default:
                throw new ModelError(`Unsupported provider: ${provider}`);
        }
    }

    /**
     * Asynchronous chat completion
     */
    async achat(messages: ChatCompletionMessageParam[], tools: ToolSchema[] = [], stream: boolean = true): Promise<ModelAchatResult> {
        const provider = this.config.provider.toLowerCase();
        const useStream = stream !== undefined ? stream : !!this.config.stream;

        try {
            return this._callWithRetry(async () => {
                switch (provider) {
                    case 'openai':
                    case 'deepseek':
                    case 'anthropic':
                        return this._callOpenAICompatible(messages, tools, useStream);
                    case 'gemini':
                        return this._callGemini(messages, tools, useStream);
                    default:
                        throw new ModelError(`Unsupported provider: ${provider}`);
                }
            });
        } catch (error) {
            logger.error(`Model call failed: ${error}`);
            throw error;
        }
    }

    private isValidAchatResult(result: ModelAchatResult): boolean {
        const msg = result.assistantMessage;
        if (msg.tool_calls && msg.tool_calls.length > 0) {
            return true;
        }
        if ((msg.agent_tool_calls || []).some(tc => tc.tool_name !== 'TaskCompletion')) {
            return true;
        }
        return typeof msg.content === 'string' && msg.content.trim().length > 0;
    }

    private async _callWithRetry(handler: () => Promise<ModelAchatResult>): Promise<ModelAchatResult> {
        const maxRetries = this.maxEmptyRetries;
        let lastResult: ModelAchatResult | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const result = await handler();
            lastResult = result;
            if (this.isValidAchatResult(result)) {
                return result;
            }

            if (attempt < maxRetries) {
                logger.warn(`[${this.config.model}] Empty response (attempt ${attempt}/${maxRetries}), retrying...`);
                const backoffSeconds = Math.min(Math.max(0.5 * Math.pow(2, attempt - 1), 0.5), 4);
                await new Promise(resolve => setTimeout(resolve, backoffSeconds * 1000));
            }
        }

        logger.error(`[${this.config.model}] Empty response persisted after ${maxRetries} attempts`);
        return lastResult as ModelAchatResult;
    }

    /**
     * Call OpenAI-compatible API (OpenAI, DeepSeek, etc.)
     */
    private buildAchatResult(assistantMessage: Omit<AssistantMessageParams, 'agent_tool_calls'>): ModelAchatResult {
        const parsingFailedToolMessages: ToolMessage[] = [];
        const agentToolCalls: AgentToolcall[] = [];
        const toolCalls = assistantMessage.tool_calls || [];

        if (toolCalls.length > 0) {
            // use the first function call to get the tool name and arguments
            const firstToolCall = toolCalls[0] as ChatCompletionMessageFunctionToolCall;
            const toolName = firstToolCall.function.name || 'unknown_tool';
            const toolArguments = firstToolCall.function.arguments || '';
            try {
                agentToolCalls.push({
                    tool_call_id: firstToolCall.id,
                    tool_name: toolName,
                    tool_arguments: JSON.parse(toolArguments),
                    source: 'function_call',
                });
            } catch (error: any) {
                const errorMsg = error?.message || 'Unknown JSON parse error';
                parsingFailedToolMessages.push(
                    new ToolMessage({
                        content: assistantMessage.content + toolArguments,
                        tag: 'ToolcallExtractionFailed',
                        tool_call_id: firstToolCall.id || `ft_parse_error_${Date.now()}`,
                        tool_name: toolName,
                        status: 'failed',
                        preContent: `Error parsing JSON arguments for argument content of the tool call ${toolName}, error is ${errorMsg}: `,
                        source: 'function_call',
                    })
                );
            }
        } else if (typeof assistantMessage.content === 'string' && assistantMessage.content.trim().length > 0) {
            try {
                agentToolCalls.push(...extractToolcallsFromStr(assistantMessage.content, SystemToolStore));
            } catch (error: any) {
                parsingFailedToolMessages.push(
                    new ToolMessage({
                        content: assistantMessage.content,
                        tag: 'ToolcallExtractionFailed',
                        tool_call_id: `ct_parse_error_${Date.now()}`,
                        tool_name: 'unknown_tool',
                        status: 'failed',
                        preContent: `Error parsing chat toolcalls from assistant content: ${error?.message || String(error)}`,
                        postContent: `The chat toolcall extraction failed. According to the chain cut-off strategy, all subsequent Toolcalls are discarded.`,
                        source: 'chat',
                    })
                );
            }
        }

        (assistantMessage as any).agent_tool_calls = agentToolCalls;

        return {
            assistantMessage: new AssistantMessage(assistantMessage),
            parsingFailedToolMessages,
        };
    }

    private async _callOpenAICompatible(messages: ChatCompletionMessageParam[], tools?: ToolSchema[], stream: boolean = false): Promise<ModelAchatResult> {
        if (!this.openaiClient) {
            throw new ModelError('OpenAI client not initialized');
        }

        try {
            const params: any = {
                model: this.config.model || 'gpt-3.5-turbo',
                messages: messages,
                temperature: this.config.temperature || 0.7,
                max_tokens: this.config.maxOutputTokens || 1024,
                top_p: this.config.topP || 0.9,
                stream: stream,
            };

            // Add tools if provided
            if (tools && tools.length > 0) {
                params.tools = tools;
                params.tool_choice = 'auto';
            }

            if (stream) {
                const streamResponse = (await this.openaiClient.chat.completions.create({
                    ...params,
                    stream: true,
                })) as any; // AsyncIterable type

                let fullContent = '';
                let toolCallsMap: Record<number, any> = {};

                for await (const chunk of streamResponse) {
                    const delta = chunk.choices[0]?.delta;
                    if (!delta) continue;

                    // Handle content
                    if (delta.content) {
                        streamLogger.info(delta.content);
                        fullContent += delta.content;
                    }

                    // Handle tool calls
                    if (delta.tool_calls) {
                        for (const tc of delta.tool_calls) {
                            const index = tc.index;

                            if (!toolCallsMap[index]) {
                                toolCallsMap[index] = {
                                    id: tc.id || '',
                                    type: 'function',
                                    function: {
                                        name: tc.function?.name || '',
                                        arguments: tc.function?.arguments || '',
                                    },
                                };
                                if (tc.function?.name) {
                                    streamLogger.info(`\nTool Call: ${tc.function.name}\nArguments: `);
                                }
                            } else {
                                if (tc.function?.arguments) {
                                    toolCallsMap[index].function.arguments += tc.function.arguments;
                                    streamLogger.info(tc.function.arguments);
                                }
                            }
                        }
                    }
                }
                streamLogger.info('\n');

                const toolCalls = Object.values(toolCallsMap);
                const hasContent = fullContent.trim().length > 0;
                const hasToolCalls = toolCalls.length > 0;

                if (hasToolCalls) {
                    return this.buildAchatResult({
                        content: fullContent,
                        tool_calls: toolCalls,
                    });
                }

                // Return as system response (may contain XML tool calls or TaskCompletion)
                // Agent loop will extract tools and exit when no more tools remain
                return this.buildAchatResult({
                    content: fullContent,
                });
            } else {
                // Non-streaming
                const response = await this.openaiClient.chat.completions.create(params);

                if (!response.choices || response.choices.length === 0) {
                    throw new ModelError('No choices returned from OpenAI API');
                }

                const message = response.choices[0].message;
                const messageContent = message.content || '';
                const hasToolCalls = message.tool_calls && message.tool_calls.length > 0;

                // Handle tool calls
                if (hasToolCalls) {
                    return this.buildAchatResult({
                        content: messageContent,
                        tool_calls: message.tool_calls,
                    });
                }

                // Return as system response (may contain XML tool calls or TaskCompletion)
                // Agent loop will extract tools and exit when no more tools remain
                return this.buildAchatResult({
                    content: messageContent,
                });
            }
        } catch (error: any) {
            const errorMsg = error.message || 'Unknown error';
            throw new ModelError(`OpenAI-compatible API call failed: ${errorMsg}, model config: ${JSON.stringify(this.config)}`);
        }
    }

    /**
     * Call Anthropic API
     */
    private async _callAnthropic(messages: ChatCompletionMessageParam[], tools?: ToolSchema[], stream: boolean = false): Promise<ModelAchatResult> {
        if (!this.anthropicClient) {
            throw new ModelError('Anthropic client not initialized');
        }

        try {
            // Anthropic requires system message to be separate
            const systemMessage = messages.find((m: ChatCompletionMessageParam) => m.role === 'system');
            const nonSystemMessages = messages.filter((m: ChatCompletionMessageParam) => m.role !== 'system');

            const params: any = {
                model: this.config.model || 'claude-3-sonnet-20240229',
                messages: nonSystemMessages,
                max_tokens: this.config.maxOutputTokens || 4096,
                temperature: this.config.temperature || 0.7,
                top_p: this.config.topP || 0.9,
                stream,
            };

            if (systemMessage && typeof systemMessage.content === 'string') {
                params.system = systemMessage.content;
            }

            // Add tools if provided (convert to Anthropic format)
            if (tools && tools.length > 0) {
                params.tools = tools
                    .map((tool: ToolSchema) => {
                        if ('function' in tool && tool.function) {
                            return {
                                name: tool.function.name,
                                description: tool.function.description,
                                input_schema: tool.function.parameters,
                            };
                        }
                        if ('name' in tool && 'input_schema' in tool && tool.name && tool.input_schema) {
                            return {
                                name: tool.name,
                                description: tool.description || '',
                                input_schema: tool.input_schema,
                            };
                        }
                        return null;
                    })
                    .filter(Boolean);
            }

            if (stream) {
                const streamResponse = await this.anthropicClient.messages.stream({
                    ...params,
                    stream: true,
                });

                let fullContent = '';
                let toolUses: any[] = [];

                for await (const event of streamResponse) {
                    if (event.type === 'content_block_start') {
                        if (event.content_block.type === 'tool_use') {
                            const toolUse = event.content_block;
                            streamLogger.info(`\nTool Call: ${toolUse.name}\nArguments: `);
                        }
                    } else if (event.type === 'content_block_delta') {
                        if (event.delta.type === 'text_delta') {
                            streamLogger.info(event.delta.text);
                            fullContent += event.delta.text;
                        } else if (event.delta.type === 'input_json_delta') {
                            streamLogger.info(event.delta.partial_json);
                        }
                    } else if (event.type === 'message_delta') {
                        // Handle message delta (e.g., stop_reason)
                    }
                }
                streamLogger.info('\n');

                // For streaming, we need to collect tool_use blocks from the final message
                // Since the SDK doesn't provide a clean way to get this during streaming,
                // we'll make another non-streaming call or handle differently
                return this.buildAchatResult({
                    content: fullContent || JSON.stringify(toolUses),
                });
            } else {
                // Non-streaming
                const response = await this.anthropicClient.messages.create(params);

                if (!response.content || response.content.length === 0) {
                    throw new ModelError('No content returned from Anthropic API');
                }

                const textContent = response.content
                    .filter((c: any) => c.type === 'text')
                    .map((c: any) => c.text || '')
                    .join('');

                const toolUses = response.content.filter((c: any) => c.type === 'tool_use');
                if (toolUses.length > 0) {
                    const toolCalls = toolUses.map((toolUse: any, index: number) => ({
                        id: toolUse.id || `call_${Date.now()}_${index}`,
                        type: 'function' as const,
                        function: {
                            name: toolUse.name,
                            arguments: JSON.stringify(toolUse.input || {}),
                        },
                    })) as ChatCompletionAssistantMessageParam['tool_calls'];

                    return this.buildAchatResult({
                        content: textContent,
                        tool_calls: toolCalls,
                    });
                }

                return this.buildAchatResult({
                    content: textContent,
                });
            }
        } catch (error: any) {
            const errorMsg = error.message || 'Unknown error';
            throw new ModelError(`Anthropic API call failed: ${errorMsg}`);
        }
    }

    /**
     * Call Google Gemini API
     */
    private async _callGemini(messages: ChatCompletionMessageParam[], tools?: ToolSchema[], stream: boolean = false): Promise<ModelAchatResult> {
        if (!this.geminiClient) {
            throw new ModelError('Gemini client not initialized');
        }

        try {
            const modelName = this.config.model || 'gemini-pro';
            const model = this.geminiClient.getGenerativeModel({
                model: modelName,
                generationConfig: {
                    temperature: this.config.temperature || 0.7,
                    maxOutputTokens: this.config.maxOutputTokens || 2048,
                    topP: this.config.topP || 0.9,
                },
            });

            // Convert OpenAI format messages to Gemini format
            const contents = this._convertMessagesToGeminiFormat(messages);

            if (stream) {
                const result = await model.generateContentStream({ contents });

                let fullContent = '';
                let functionCalls: any[] = [];

                for await (const chunk of result.stream) {
                    try {
                        const chunkText = await chunk.text();
                        if (chunkText) {
                            streamLogger.info(chunkText);
                            fullContent += chunkText;
                        }
                    } catch (e) {
                        // text() may throw if there's no text in this chunk
                    }

                    // Check for function calls
                    const candidates = chunk.candidates;
                    if (candidates && candidates[0]?.content?.parts) {
                        for (const part of candidates[0].content.parts) {
                            if (part.functionCall) {
                                functionCalls.push(part.functionCall);
                            }
                        }
                    }
                }
                streamLogger.info('\n');

                const hasContent = fullContent.trim().length > 0;
                const hasFunctionCalls = functionCalls.length > 0;

                if (hasFunctionCalls) {
                    // Convert Gemini function calls to OpenAI format
                    const toolCalls = functionCalls.map((fc: any, index: number) => ({
                        id: `call_${Date.now()}_${index}`,
                        type: 'function' as const,
                        function: {
                            name: fc.name,
                            arguments: JSON.stringify(fc.args),
                        },
                    })) as ChatCompletionAssistantMessageParam['tool_calls'];

                    return this.buildAchatResult({
                        content: fullContent,
                        tool_calls: toolCalls,
                    });
                }

                // Return as system response (may contain XML tool calls or TaskCompletion)
                // Agent loop will extract tools and exit when no more tools remain
                return this.buildAchatResult({
                    content: fullContent,
                });
            } else {
                // Non-streaming
                const result = await model.generateContent({ contents });
                const response: any = result.response;

                if (!response.candidates || response.candidates.length === 0) {
                    throw new ModelError('No candidates returned from Gemini API');
                }

                const candidate = response.candidates[0];
                const content = candidate.content;

                if (!content || !content.parts || content.parts.length === 0) {
                    throw new ModelError('No content parts returned from Gemini API');
                }

                // Check for function calls
                const functionCalls = content.parts.filter((part: any) => part.functionCall);
                const hasFunctionCalls = functionCalls.length > 0;

                if (hasFunctionCalls) {
                    const toolCalls = functionCalls.map((part: any, index: number) => ({
                        id: `call_${Date.now()}_${index}`,
                        type: 'function' as const,
                        function: {
                            name: part.functionCall.name,
                            arguments: JSON.stringify(part.functionCall.args),
                        },
                    })) as ChatCompletionAssistantMessageParam['tool_calls'];

                    const textParts = content.parts.filter((part: any) => part.text);
                    const textContent = textParts.map((part: any) => part.text).join('');

                    return this.buildAchatResult({
                        content: textContent,
                        tool_calls: toolCalls,
                    });
                }

                // Return as system response (may contain XML tool calls or TaskCompletion)
                // Agent loop will extract tools and exit when no more tools remain
                const textParts = content.parts.filter((part: any) => part.text);
                const textContent = textParts.map((part: any) => part.text).join('');
                return this.buildAchatResult({
                    content: textContent,
                });
            }
        } catch (error: any) {
            const errorMsg = error.message || 'Unknown error';
            throw new ModelError(`Gemini API call failed: ${errorMsg}`);
        }
    }

    /**
     * Convert OpenAI format messages to Gemini format
     */
    private _convertMessagesToGeminiFormat(messages: ChatCompletionMessageParam[]): any[] {
        const contents: any[] = [];

        for (const message of messages) {
            if (message.role === 'system') {
                // Gemini doesn't have a separate system role, add as user message
                contents.push({
                    role: 'user',
                    parts: [{ type: 'text', text: message.content }],
                });
            } else if (message.role === 'user') {
                contents.push({
                    role: 'user',
                    parts: [{ type: 'text', text: message.content }],
                });
            } else if (message.role === 'assistant') {
                const parts: any[] = [];

                if (message.content) {
                    parts.push({ text: message.content });
                }

                if (message.tool_calls) {
                    for (const toolCall of message.tool_calls) {
                        if (!('function' in toolCall)) continue;
                        parts.push({
                            functionCall: {
                                name: toolCall.function.name,
                                args: JSON.parse(toolCall.function.arguments),
                            },
                        });
                    }
                }

                contents.push({
                    role: 'model',
                    parts: parts,
                });
            } else if (message.role === 'tool') {
                // Tool result message
                contents.push({
                    role: 'function',
                    parts: [
                        {
                            functionResponse: {
                                name: message.tool_call_id,
                                response: {
                                    content: message.content,
                                },
                            },
                        },
                    ],
                });
            }
        }

        return contents;
    }

    /**
     * Get model configuration
     */
    getConfig(): ModelConfig {
        return { ...this.config };
    }

    /**
     * Get model name
     */
    getName(): string {
        return this.config.model;
    }

    /**
     * Check if model supports tool calling
     */
    supportsToolCalling(): boolean {
        const supportedModels = ['gpt-3.5-turbo', 'gpt-4', 'claude-3', 'deepseek-chat', 'gemini-pro', 'gemini-1.5'];
        return supportedModels.some(model => this.config.model.includes(model));
    }
}
