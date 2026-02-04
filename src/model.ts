/**
 * Model abstraction layer using official SDKs
 *
 * Provides a unified interface for multiple LLM providers:
 * - OpenAI (and compatible APIs like DeepSeek)
 * - Anthropic Claude
 * - Google Gemini
 */

import { ModelConfig, ModelError } from './types';
import { loadModelConfig } from './configs/configLoader';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger, streamLogger } from './utils';

/**
 * Model response interface
 */
export interface ModelResponse {
    type: 'system' | 'user' | 'TaskCompletion';
    extractedResult: () => string | any[] | Record<string, any>;
    rawContentFromLlm?: string;
}

/**
 * Model class for interacting with LLM providers
 * Uses official SDKs for better reliability and type safety
 */
export class Model {
    private modelName: string;
    private config: ModelConfig;
    private openaiClient?: OpenAI;
    private anthropicClient?: Anthropic;
    private geminiClient?: GoogleGenerativeAI;

    constructor(model?: string | ModelConfig) {
        if (typeof model === 'string' || model === undefined) {
            this.modelName = model || 'deepseek';
            this.config = loadModelConfig(this.modelName);
        } else {
            // model is ModelConfig object
            this.config = model;
            this.modelName = model.model || 'deepseek';
        }

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

            // case 'anthropic':
            //     if (this.config.baseUrl.endsWith('/v1') || this.config.baseUrl.endsWith('v1/')) {
            //         this.config.baseUrl = this.config.baseUrl.slice(0, -3);
            //     }
            //     this.anthropicClient = new Anthropic({
            //         apiKey: this.config.apiKey || process.env.ANTHROPIC_API_KEY,
            //         baseURL: this.config.baseUrl,
            //         timeout: 60000,
            //     });
            //     break;

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
    async achat(messages: any[], tools?: any[], stream: boolean = true): Promise<ModelResponse[]> {
        const provider = this.config.provider.toLowerCase();
        const useStream = stream !== undefined ? stream : !!this.config.stream;

        try {
            switch (provider) {
                case 'openai':
                case 'deepseek':
                case 'anthropic':
                    return await this._callOpenAICompatible(messages, tools, useStream);
                case 'gemini':
                    return await this._callGemini(messages, tools, useStream);
                default:
                    throw new ModelError(`Unsupported provider: ${provider}`);
            }
        } catch (error) {
            logger.error(`Model call failed: ${error}`);
            throw error;
        }
    }

    /**
     * Call OpenAI-compatible API (OpenAI, DeepSeek, etc.)
     */
    private async _callOpenAICompatible(messages: any[], tools?: any[], stream: boolean = false): Promise<ModelResponse[]> {
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
                    return [
                        {
                            type: 'user',
                            extractedResult: () => ({
                                role: 'assistant',
                                content: fullContent,
                                tool_calls: toolCalls,
                            }),
                        },
                    ];
                }

                // Return as system response (may contain XML tool calls or TaskCompletion)
                // Agent loop will extract tools and exit when no more tools remain
                return [
                    {
                        type: 'system',
                        extractedResult: () => fullContent,
                        rawContentFromLlm: fullContent,
                    },
                ];
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
                    return [
                        {
                            type: 'user',
                            extractedResult: () => ({
                                role: 'assistant',
                                content: messageContent,
                                tool_calls: message.tool_calls,
                            }),
                        },
                    ];
                }

                // Return as system response (may contain XML tool calls or TaskCompletion)
                // Agent loop will extract tools and exit when no more tools remain
                return [
                    {
                        type: 'system',
                        extractedResult: () => messageContent,
                        rawContentFromLlm: messageContent,
                    },
                ];
            }
        } catch (error: any) {
            const errorMsg = error.message || 'Unknown error';
            throw new ModelError(`OpenAI-compatible API call failed: ${errorMsg}, model config: ${JSON.stringify(this.config)}`);
        }
    }

    /**
     * Call Anthropic API
     */
    private async _callAnthropic(messages: any[], tools?: any[], stream: boolean = false): Promise<ModelResponse[]> {
        if (!this.anthropicClient) {
            throw new ModelError('Anthropic client not initialized');
        }

        try {
            // Anthropic requires system message to be separate
            const systemMessage = messages.find((m: any) => m.role === 'system');
            const nonSystemMessages = messages.filter((m: any) => m.role !== 'system');

            const params: any = {
                model: this.config.model || 'claude-3-sonnet-20240229',
                messages: nonSystemMessages,
                max_tokens: this.config.maxOutputTokens || 4096,
                temperature: this.config.temperature || 0.7,
                top_p: this.config.topP || 0.9,
                stream: stream,
            };

            if (systemMessage) {
                params.system = systemMessage.content;
            }

            // Add tools if provided (convert to Anthropic format)
            if (tools && tools.length > 0) {
                params.tools = tools.map((tool: any) => ({
                    name: tool.function?.name || tool.name,
                    description: tool.function?.description || tool.description,
                    input_schema: tool.function?.parameters || tool.input_schema,
                }));
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
                const hasContent = fullContent.trim().length > 0;
                const hasToolUses = toolUses.length > 0;

                // Return as system response (may contain XML tool calls or TaskCompletion)
                // Agent loop will extract tools and exit when no more tools remain
                return [
                    {
                        type: 'system',
                        extractedResult: () => fullContent || toolUses,
                        rawContentFromLlm: fullContent,
                    },
                ];
            } else {
                // Non-streaming
                const response = await this.anthropicClient.messages.create(params);

                if (!response.content || response.content.length === 0) {
                    throw new ModelError('No content returned from Anthropic API');
                }

                // Handle tool calls
                const toolUse = response.content.find((c: any) => c.type === 'tool_use');
                if (toolUse) {
                    return [
                        {
                            type: 'system',
                            extractedResult: () => [toolUse],
                        },
                    ];
                }

                // Handle regular text response
                const textContent: any = response.content.find((c: any) => c.type === 'text');
                const messageContent = textContent?.text || '';

                // Return as system response (may contain XML tool calls or TaskCompletion)
                // Agent loop will extract tools and exit when no more tools remain
                return [
                    {
                        type: 'system',
                        extractedResult: () => messageContent,
                        rawContentFromLlm: messageContent,
                    },
                ];
            }
        } catch (error: any) {
            const errorMsg = error.message || 'Unknown error';
            throw new ModelError(`Anthropic API call failed: ${errorMsg}`);
        }
    }

    /**
     * Call Google Gemini API
     */
    private async _callGemini(messages: any[], tools?: any[], stream: boolean = false): Promise<ModelResponse[]> {
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
                        type: 'function',
                        function: {
                            name: fc.name,
                            arguments: JSON.stringify(fc.args),
                        },
                    }));

                    return [
                        {
                            type: 'user',
                            extractedResult: () => ({
                                role: 'assistant',
                                content: fullContent,
                                tool_calls: toolCalls,
                            }),
                        },
                    ];
                }

                // Return as system response (may contain XML tool calls or TaskCompletion)
                // Agent loop will extract tools and exit when no more tools remain
                return [
                    {
                        type: 'system',
                        extractedResult: () => fullContent,
                        rawContentFromLlm: fullContent,
                    },
                ];
            } else {
                // Non-streaming
                const result = await model.generateContent({ contents });
                const response = result.response;

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
                        type: 'function',
                        function: {
                            name: part.functionCall.name,
                            arguments: JSON.stringify(part.functionCall.args),
                        },
                    }));

                    const textParts = content.parts.filter((part: any) => part.text);
                    const textContent = textParts.map((part: any) => part.text).join('');

                    return [
                        {
                            type: 'user',
                            extractedResult: () => ({
                                role: 'assistant',
                                content: textContent,
                                tool_calls: toolCalls,
                            }),
                        },
                    ];
                }

                // Handle regular text response
                const textParts = content.parts.filter((part: any) => part.text);
                const textContent = textParts.map((part: any) => part.text).join('');

                // Return as system response (may contain XML tool calls or TaskCompletion)
                // Agent loop will extract tools and exit when no more tools remain
                return [
                    {
                        type: 'system',
                        extractedResult: () => textContent,
                        rawContentFromLlm: textContent,
                    },
                ];
            }
        } catch (error: any) {
            const errorMsg = error.message || 'Unknown error';
            throw new ModelError(`Gemini API call failed: ${errorMsg}`);
        }
    }

    /**
     * Convert OpenAI format messages to Gemini format
     */
    private _convertMessagesToGeminiFormat(messages: any[]): any[] {
        const contents: any[] = [];

        for (const message of messages) {
            if (message.role === 'system') {
                // Gemini doesn't have a separate system role, add as user message
                contents.push({
                    role: 'user',
                    parts: [{ text: message.content }],
                });
            } else if (message.role === 'user') {
                contents.push({
                    role: 'user',
                    parts: [{ text: message.content }],
                });
            } else if (message.role === 'assistant') {
                const parts: any[] = [];

                if (message.content) {
                    parts.push({ text: message.content });
                }

                if (message.tool_calls) {
                    for (const toolCall of message.tool_calls) {
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
                                name: message.name,
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
        return this.modelName;
    }

    /**
     * Check if model supports tool calling
     */
    supportsToolCalling(): boolean {
        const supportedModels = ['gpt-3.5-turbo', 'gpt-4', 'claude-3', 'deepseek-chat', 'gemini-pro', 'gemini-1.5'];
        return supportedModels.some(model => this.config.model.includes(model));
    }
}
