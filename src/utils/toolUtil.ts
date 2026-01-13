/**
 * Tool utility functions and Toolcall class
 *
 * Converts Python's tool_util.py to TypeScript
 */

import { logger } from './index';
import { Toolcall, ToolcallState, ToolcallType } from '../schemas/toolCall';

// Re-export for convenience
export { Toolcall, ToolcallState, ToolcallType };

/**
 * Check if message contains tool calls
 */
export function hasToolcall(msg: string | Toolcall[], toolStore?: Record<string, any>): boolean {
    if (typeof msg === 'string') {
        if (!toolStore) return false;

        for (const toolName of Object.keys(toolStore)) {
            if (msg.includes(`<${toolName}>`) && msg.includes(`</${toolName}>`)) {
                return true;
            }
        }
        return false;
    } else if (Array.isArray(msg)) {
        for (const t of msg) {
            if (t instanceof Toolcall && t.name) {
                return true;
            }
        }
        return false;
    }

    logger.error(`msg: ${msg} is not a valid list.`);
    return false;
}

/**
 * Check if writing JSON file
 * 检查是否正在写入JSON文件
 *
 * 支持以下路径参数名：
 * - path
 * - filePath
 * - apiFilePath
 *
 * @param argumentsTxt 工具参数的XML文本
 * @param toolName 工具名称
 * @returns 如果是写入JSON文件则返回true
 */
export function isWriteJsonFile(argumentsTxt: string, toolName: string): boolean {
    if (!toolName.startsWith('FileEditor.') && !toolName.startsWith('ApiTool.')) {
        return false;
    }

    // 匹配 .json </path> 或 .json</filePath> 或 .json  </apiFilePath> 等
    const pattern = /\.json\s*<\/(path|filePath|apiFilePath)>/;
    return pattern.test(argumentsTxt);
}

/**
 * Unescape HTML/XML entities in a string.
 *
 * LLMs often output XML-escaped content that needs unescaping before processing.
 *
 * Supported entities:
 * - Named: &quot; &amp; &lt; &gt; &apos;
 * - Numeric decimal: &#34; &#38;
 * - Numeric hex: &#x22; &#x26;
 *
 * @param str - String potentially containing HTML entities
 * @returns String with entities unescaped to their character equivalents
 *
 * @example
 * unescapeHtmlEntities('&quot;Hello&quot;') // Returns: "Hello"
 * unescapeHtmlEntities('&#60;tag&#62;') // Returns: "<tag>"
 */
function unescapeHtmlEntities(str: string): string {
    // Replace numeric entities first (decimal and hex)
    // This prevents issues with double-unescaping
    let result = str;
    result = result.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
    result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

    // Replace named entities using a single-pass approach
    result = result.replace(/&(?:quot|amp|lt|gt|apos);/g, match => {
        const entities: Record<string, string> = {
            '&quot;': '"',
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&apos;': "'",
        };
        return entities[match] || match;
    });

    return result;
}

/**
 * Convert string to object from XML format
 */
export function convertStrToObject(txt: string, toolName: string, argNames: string[]): Record<string, any> {
    const result: Record<string, any> = {};

    // Build complete start and end tags
    const startTag = `<${toolName}>`;
    const endTag = `</${toolName}>`;

    // Extract content inside tool tags
    const toolPattern = new RegExp(`${escapeRegExp(startTag)}(.*?)${escapeRegExp(endTag)}`, 's');
    const toolMatch = toolPattern.exec(txt);

    if (!toolMatch) {
        return result;
    }

    const innerContent = toolMatch[1];

    // Extract each parameter value
    for (const argName of argNames) {
        const argStartTag = `<${argName}>`;
        const argEndTag = `</${argName}>`;

        const argPattern = new RegExp(`${escapeRegExp(argStartTag)}(.*?)${escapeRegExp(argEndTag)}`, 's');
        const argMatch = argPattern.exec(innerContent);

        if (argMatch) {
            let value = argMatch[1].trim();

            // Unescape HTML/XML entities (e.g., &quot; -> ", &#34; -> ")
            // LLMs may output XML-escaped content that needs unescaping before JSON parsing
            // This must happen BEFORE the JSON.parse() attempt below
            value = unescapeHtmlEntities(value);

            // If writing JSON file, return content directly
            if (isWriteJsonFile(txt, toolName)) {
                result[argName] = value;
                continue;
            }

            // Try to parse as JSON
            try {
                const parsedValue = JSON.parse(value);
                result[argName] = parsedValue;
            } catch {
                // If JSON parsing fails, keep as string
                result[argName] = value;
            }
        }
    }

    return result;
}

/**
 * Extract tool calls from string
 */
export function extractToolcallsFromStr(txt: string, toolStore: Record<string, any>): Toolcall[] {
    const matches: Array<[number, Toolcall]> = [];

    for (const toolName of Object.keys(toolStore)) {
        const pattern = new RegExp(`<${escapeRegExp(toolName)}>(.*?)</${escapeRegExp(toolName)}>`, 'gs');
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(txt)) !== null) {
            const argumentsTxt = match[1].trim();

            if (!isWriteJsonFile(argumentsTxt, toolName) && argumentsTxt.startsWith('{') && argumentsTxt.endsWith('}')) {
                matches.push([
                    match.index,
                    new Toolcall({
                        name: toolName,
                        input: {},
                        isExtractedSuccess: false,
                        type: 'system',
                        rawContentFromLlm: txt,
                    }),
                ]);
                continue;
            }

            const rawInput = `<${toolName}>${argumentsTxt}</${toolName}>`;
            let pythonObjectInput: Record<string, any> = {};

            if (rawInput) {
                const argNames = toolStore[toolName].argNames || [];
                pythonObjectInput = convertStrToObject(rawInput, toolName, argNames);
            }

            matches.push([
                match.index,
                new Toolcall({
                    name: toolName,
                    input: pythonObjectInput,
                    type: 'system',
                }),
            ]);
        }
    }

    // Sort by occurrence order and return
    matches.sort((a, b) => a[0] - b[0]);
    return matches.map(([, tc]) => tc);
}

/**
 * Execute a single tool
 */
export async function executeSingleTool(toolcall: Toolcall, toolStore: Record<string, any>[]): Promise<Toolcall> {
    if (!Array.isArray(toolStore)) {
        toolStore = [toolStore];
    }

    // Return failed toolcall
    if (!toolcall.isExtractedSuccess) {
        return toolcall;
    }

    try {
        // Execute the tool directly
        if (toolcall.name && !toolcall.name.startsWith('FileEditor.') && !toolcall.name.startsWith('ThinkTool.')) {
            logger.info(`Executing Tool ${toolcall.name} with arguments: ${JSON.stringify(toolcall.input)}`);
        }

        for (const ts of toolStore) {
            let toolCall: any;
            let argNames: string[] = [];

            // Check if tool store has the tool
            // Support both class-based ToolStore (with hasTool/getTool) and object-based store
            if (typeof ts.hasTool === 'function' && ts.hasTool(toolcall.name)) {
                const toolDesc = ts.getTool(toolcall.name);
                toolCall = toolDesc ? toolDesc.execute : undefined;
                argNames = toolDesc ? toolDesc.argNames : [];
            } else if (toolcall.name in ts) {
                toolCall = ts[toolcall.name].execute;
                argNames = ts[toolcall.name].argNames || [];
            }

            if (toolCall) {
                let result: any;

                if (typeof toolCall === 'function') {
                    // Map arguments based on argNames if available
                    if (argNames && argNames.length > 0) {
                        // Map input object to argument list based on docstring parameter order
                        const args = argNames.map(name => toolcall.input[name]);
                        result = await toolCall(...args);
                    } else {
                        // Fallback: pass the input object directly
                        // This handles cases where tool takes a single object argument or no arguments
                        result = await toolCall(toolcall.input);
                    }
                } else {
                    logger.error(`Tool ${toolcall.name} is not callable`);
                    toolcall.executedContent = `Tool '${toolcall.name}' is not callable`;
                    toolcall.executedState = 'failed';
                    return toolcall;
                }

                toolcall.executedContent = String(result);
                toolcall.executedState = 'success';
                return toolcall;
            }
        }

        // Tool not found
        toolcall.executedContent = `Tool '${toolcall.name}' not found in tool_store. Please check the tool name.`;
        toolcall.executedState = 'failed';
        return toolcall;
    } catch (error) {
        const errorMsg = `Error executing tool: ${error}`;
        toolcall.executedContent = errorMsg;
        toolcall.executedState = 'failed';
        return toolcall;
    }
}

/**
 * Execute multiple tools
 */
export async function executeTools(
    toolCalls: Toolcall[],
    toolStore: Record<string, any>[],
    parallel: boolean = false
): Promise<Toolcall[]> {
    if (parallel) {
        return Promise.all(toolCalls.map(call => executeSingleTool(call, toolStore)));
    } else {
        const results: Toolcall[] = [];
        for (const call of toolCalls) {
            results.push(await executeSingleTool(call, toolStore));
        }
        return results;
    }
}

/**
 * Helper function to escape regex special characters
 */
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
