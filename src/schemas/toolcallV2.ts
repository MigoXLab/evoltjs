/**
 * Toolcall schemas
 *
 * Translated from Python evolt/schemas/toolcall.py
 */

import { createHash, randomUUID } from 'crypto';
import {
    AssistantMessage,
    UserMessage,
    ToolMessage,
    Message,
    type AnyMessage,
} from './messageV2';

// ---- Dependency interfaces ----

/** Minimal ToolStore interface matching Python's ToolStore */
export interface ToolStoreLike {
    keys(): string[];
    getItem(name: string): { argNames: string[];[key: string]: any };
    [toolName: string]: any;
}

// ---- Internal utility helpers ----

function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if writing JSON file.
 * Matches Python's is_write_json_file from utils/tool_util.py
 */
function isWriteJsonFile(argumentsTxt: string, toolName: string): boolean {
    if (!toolName.startsWith('FileEditor.') && !toolName.startsWith('ApiTool.')) {
        return false;
    }
    const pattern = /\.json\s*<\/(path|filePath|apiFilePath)>/;
    return pattern.test(argumentsTxt);
}

/**
 * JSON.stringify with recursively sorted keys.
 * Matches Python's json.dumps(sort_keys=True, separators=(',', ':'))
 */
function stableStringify(obj: any): string {
    return JSON.stringify(obj, (_key, value) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return Object.keys(value)
                .sort()
                .reduce((sorted: Record<string, any>, k: string) => {
                    sorted[k] = value[k];
                    return sorted;
                }, {});
        }
        return value;
    });
}

/**
 * Try to parse a string as a JSON literal.
 * Falls back to returning the original string on failure.
 * (Equivalent to Python's ast.literal_eval with fallback)
 */
function safeParseLiteral(value: string): any {
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

// ---- Types ----

export type ToolcallSource = 'chat' | 'function_call';

// ---- GeneratedToolcallMessage ----

/**
 * Represents a single generated tool call message from an LLM response.
 *
 * Corresponds to Python's GeneratedToolcallMessage.
 */
export class GeneratedToolcallMessage {
    toolName: string;
    toolArguments: Record<string, any>;
    toolCallId: string;
    source: ToolcallSource;
    isSuccess: boolean;
    failedReason?: string;
    /**
     * Chat XML format Toolcall content from LLM response.
     * Function Call Toolcall content from LLM response is in toolArguments.
     */
    rawContentFromLlm?: string;

    constructor(config: {
        toolName: string;
        toolArguments?: Record<string, any>;
        toolCallId?: string;
        source?: ToolcallSource;
        isSuccess?: boolean;
        failedReason?: string;
        rawContentFromLlm?: string;
    }) {
        this.toolName = config.toolName;
        this.toolArguments = config.toolArguments ?? {};
        this.toolCallId = config.toolCallId ?? randomUUID();
        this.source = config.source ?? 'chat';
        this.isSuccess = config.isSuccess ?? true;
        this.failedReason = config.failedReason;
        this.rawContentFromLlm = config.rawContentFromLlm;
    }

    toObject(): Record<string, any> {
        return {
            tool_name: this.toolName,
            tool_arguments: this.toolArguments,
            tool_call_id: this.toolCallId,
            source: this.source,
            is_success: this.isSuccess,
            failed_reason: this.failedReason,
            raw_content_from_llm: this.rawContentFromLlm,
        };
    }

    /**
     * Convert to V2 message(s) for API consumption.
     *
     * Returns an array because a failed extraction may produce
     * both an assistant message and a user/tool error message.
     */
    formatForApi(): AnyMessage[] {
        // 1. Chat source
        if (this.source === 'chat') {
            // 1.1 Successful extraction
            if (this.isSuccess) {
                return [
                    new AssistantMessage({ content: this.rawContentFromLlm ?? '' }),
                ];
            }
            // 1.2 Failed extraction
            return [
                new AssistantMessage({ content: this.rawContentFromLlm ?? '' }),
                new UserMessage({
                    content: `Toolcall ${this.toolName} failed to extract: ${this.failedReason ?? 'Unknown reason'}`,
                }),
            ];
        }

        // 2. Function Call source
        const toolCallEntry = {
            id: `tool_${this.toolCallId}`,
            type: 'function' as const,
            function: {
                name: this.toolName,
                arguments: JSON.stringify(this.toolArguments),
            },
        };
        const assistantMessage = new AssistantMessage({
            content: '',
            tool_calls: [toolCallEntry],
        });

        // 2.1 Successful extraction
        if (this.isSuccess) {
            return [
                assistantMessage,
            ];
        }

        // 2.2 Failed extraction
        return [
            assistantMessage,
            new ToolMessage({
                content: this.failedReason ?? 'Unknown reason',
                tool_call_id: `tool_${this.toolCallId}`,
                tool_name: this.toolName,
            }),
        ];
    }

    /** SHA-256 hash of (toolName, toolArguments) for idempotency checks */
    get idempotencyKey(): string {
        const payload = {
            tool_name: this.toolName,
            tool_arguments: this.toolArguments,
        };
        const canonical = stableStringify(payload);
        return createHash('sha256').update(canonical).digest('hex');
    }
}

// ---- Standalone functions ----

/**
 * 从XML格式的Toolcall Arguments字符串中提取指定参数的值
 *
 * Extract specified argument values from an XML-formatted toolcall arguments string.
 *
 * @param argumentContent - 包含XML格式的Toolcall Arguments字符串
 * @param toolName - 工具名称，用于构建完整的XML标签
 * @param argNames - 需要提取的参数名称列表
 * @returns 包含提取参数的字典, arg_value 是 JS literal (string, number, boolean, array, object, etc.)
 */
export function extractToolcallArguments(
    argumentContent: string,
    toolName: string,
    argNames: string[],
): Record<string, any> {
    const toolcallArguments: Record<string, any> = {};

    // 构建完整的开始标签和结束标签
    const startTag = `<${toolName}>`;
    const endTag = `</${toolName}>`;

    // 提取工具标签内的内容
    const toolPattern = new RegExp(
        `${escapeRegExp(startTag)}(.*?)${escapeRegExp(endTag)}`,
        's',
    );
    const toolMatch = toolPattern.exec(argumentContent);

    if (!toolMatch) {
        return toolcallArguments;
    }

    const innerContent = toolMatch[1];

    // 提取每个参数的值
    for (const argName of argNames) {
        const argStartTag = `<${argName}>`;
        const argEndTag = `</${argName}>`;

        const argPattern = new RegExp(
            `${escapeRegExp(argStartTag)}(.*?)${escapeRegExp(argEndTag)}`,
            's',
        );
        const argMatch = argPattern.exec(innerContent);

        if (argMatch) {
            const value = argMatch[1].trim();

            // 如果参数是 JSON 文件路径和 Json 格式内容，则直接返回参数内容，不进行对象转换
            if (isWriteJsonFile(argumentContent, toolName)) {
                toolcallArguments[argName] = value;
                continue;
            }

            // 使用 JSON.parse 安全地评估字面量 (equivalent to ast.literal_eval)
            toolcallArguments[argName] = safeParseLiteral(value);
        }
    }

    return toolcallArguments;
}

// ---- Helper to resolve argNames from a ToolStore entry ----

function resolveArgNames(toolStore: ToolStoreLike, toolName: string): string[] {
    // Support class-based ToolStore with getItem()
    if (typeof toolStore.getItem === 'function') {
        try {
            const tool = toolStore.getItem(toolName);
            return tool?.argNames ?? [];
        } catch {
            // fallback
        }
    }
    // Support plain-object ToolStore
    const entry = toolStore[toolName];
    if (entry) {
        return entry.argNames ?? entry.arg_names ?? [];
    }
    return [];
}

// ---- Toolcall extraction functions ----

/**
 * Extract toolcall messages from a chat message content (XML format).
 *
 * @param content - The chat message content string
 * @param toolStore - ToolStore for resolving tool names and argument names
 * @returns GeneratedToolcallMessage[] sorted by order of appearance
 */
export function extractToolcallsFromChatContent(
    content: string,
    toolStore: ToolStoreLike,
): GeneratedToolcallMessage[] {
    const matches: Array<{ index: number; message: GeneratedToolcallMessage }> = [];

    for (const toolName of toolStore.keys()) {
        const pattern = new RegExp(
            `<${escapeRegExp(toolName)}>(.*?)</${escapeRegExp(toolName)}>`,
            'gs',
        );
        const argNames = resolveArgNames(toolStore, toolName);
        let m: RegExpExecArray | null;

        while ((m = pattern.exec(content)) !== null) {
            const innerContent = m[1].trim();
            const fullMatch = m[0].trim();

            // LLM 误返回 JSON 对象而非 XML 子标签 → 标记为提取失败
            const isMalformedJsonBody =
                !isWriteJsonFile(fullMatch, toolName) &&
                innerContent.startsWith('{') &&
                innerContent.endsWith('}');

            matches.push({
                index: m.index,
                message: new GeneratedToolcallMessage({
                    toolName,
                    toolArguments: isMalformedJsonBody
                        ? {}
                        : extractToolcallArguments(fullMatch, toolName, argNames),
                    source: 'chat',
                    isSuccess: !isMalformedJsonBody,
                    rawContentFromLlm: fullMatch,
                }),
            });
        }
    }

    matches.sort((a, b) => a.index - b.index);
    const result = matches.map((m) => m.message);

    console.debug('Extracted toolcalls in order:', result.map((t) => t.toolName));

    return result;
}

/**
 * Extract a toolcall message from a function call response.
 *
 * @param content - The raw LLM response content
 * @param options - Function call metadata
 * @returns GeneratedToolcallMessage[] (single element)
 */
export function extractToolcallsFromFunctionCall(
    content: string,
    options: {
        toolName?: string;
        toolArgumentsContent?: string;
        toolCallId?: string;
    },
): GeneratedToolcallMessage[] {
    const { toolArgumentsContent, toolCallId } = options;
    const toolName = options.toolName ?? 'unknown_tool';

    let toolArguments: Record<string, any>;
    try {
        toolArguments = JSON.parse(toolArgumentsContent ?? '{}');
    } catch (e) {
        console.warn(`Failed to parse tool arguments for ${toolName}: ${e}`);
        return [
            new GeneratedToolcallMessage({
                toolName,
                toolArguments: {},
                toolCallId,
                source: 'function_call',
                isSuccess: false,
                failedReason: `Failed to parse JSON arguments for ${toolName}: ${e}`,
                rawContentFromLlm: toolArgumentsContent,
            }),
        ];
    }

    return [
        new GeneratedToolcallMessage({
            toolName,
            toolArguments,
            toolCallId,
            source: 'function_call',
            isSuccess: true,
            rawContentFromLlm: content,
        }),
    ];
}

/**
 * Extract toolcall messages from an OpenAI-format LLM message (either chat or function call).
 *
 * @param content - The message content (chat text or function call content)
 * @param options - Additional options for extraction
 * @returns GeneratedToolcallMessage[]
 * @throws Error if content is neither a chat message nor a function call message
 */
export function extractToolcallsFromLlmMessage(
    content?: string,
    options?: {
        toolName?: string;
        toolArgumentsContent?: string;
        toolCallId?: string;
        toolStore?: ToolStoreLike;
    },
): GeneratedToolcallMessage[] {
    const { toolName, toolArgumentsContent, toolCallId, toolStore } =
        options ?? {};

    // 1. Content is a chat message
    if (content && !toolCallId) {
        if (!toolStore) {
            throw new Error(
                'toolStore is required for chat content extraction',
            );
        }
        return extractToolcallsFromChatContent(content, toolStore);
    }

    // 2. Content is a function call message
    if (toolCallId) {
        return extractToolcallsFromFunctionCall(
            content ?? '',
            { toolName, toolArgumentsContent, toolCallId },
        );
    }

    throw new Error(
        `Content is not a chat message or a function call message, content: ${content}`,
    );
}

// ---- ExecutedToolcallMessage ----

/**
 * Represents a tool call that has been executed, containing metadata and result.
 *
 * Corresponds to Python's ExecutedToolcallMessage.
 */
export class ExecutedToolcallMessage {
    metadata: GeneratedToolcallMessage;
    isSuccess: boolean;
    result: string | ToolMessage;

    constructor(config: {
        metadata: GeneratedToolcallMessage;
        isSuccess?: boolean;
        result?: string | ToolMessage;
    }) {
        this.metadata = config.metadata;
        this.isSuccess = config.isSuccess ?? true;
        this.result = config.result ?? '';
    }

    toObject(): Record<string, any> {
        return {
            metadata: this.metadata.toObject(),
            is_success: this.isSuccess,
            result: this.result instanceof ToolMessage ? this.result.toObject() : this.result,
        };
    }

    /**
     * Format the execution result as a V2 Message for API consumption.
     */
    formatForApi(): AnyMessage {
        // If result is already a Message, return it directly
        if (this.result instanceof Message) {
            return this.result as AnyMessage;
        }

        const resultContent = this.isSuccess
            ? String(this.result ?? '')
            : `Toolcall ${this.metadata.toolName} failed to execute: ${this.result}`;

        // Chat source → user message
        if (this.metadata.source === 'chat') {
            return new UserMessage({ content: resultContent });
        }

        // Function call source → tool message
        return new ToolMessage({
            content: resultContent,
            tool_call_id: `tool_${this.metadata.toolCallId}`,
            tool_name: this.metadata.toolName,
        });
    }
}
