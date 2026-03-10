/**
 * Tool utility functions and Toolcall class
 *
 * Converts Python's tool_util.py to TypeScript
 */

import { ToolStore } from '@/types';
import { AgentToolcall } from '@/schemas/toolCall';
import crypto from 'crypto';

// Re-export for convenience
export { AgentToolcall };

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
export function extractToolcallsFromStr(txt: string, toolStore: ToolStore): AgentToolcall[] {
    const matches: Array<[number, AgentToolcall]> = [];

    for (const toolName of toolStore.keys()) {
        const pattern = new RegExp(`<${escapeRegExp(toolName)}>(.*?)</${escapeRegExp(toolName)}>`, 'gs');
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(txt)) !== null) {
            const argumentsTxt = match[1].trim();

            if (!isWriteJsonFile(argumentsTxt, toolName) && argumentsTxt.startsWith('{') && argumentsTxt.endsWith('}')) {
                matches.push([
                    match.index,
                    {
                        tool_name: toolName,
                        tool_arguments: {},
                        tool_call_id: 'ct_' + crypto.randomUUID(),
                        source: 'chat',
                    } as AgentToolcall,
                ]);
                continue;
            }

            const rawInput = `<${toolName}>${argumentsTxt}</${toolName}>`;
            let args: Record<string, any> = {};

            if (rawInput) {
                const argNames = toolStore.getItem(toolName).argNames;
                args = convertStrToObject(rawInput, toolName, argNames);
            }

            matches.push([
                match.index,
                {
                    tool_name: toolName,
                    tool_arguments: args,
                    tool_call_id: 'ct_' + crypto.randomUUID(),
                    source: 'chat',
                } as AgentToolcall,
            ]);
        }
    }

    // Sort by occurrence order and return
    matches.sort((a, b) => a[0] - b[0]);
    return matches.map(([, tc]) => tc);
}

/**
 * Helper function to escape regex special characters
 */
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
