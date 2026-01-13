/**
 * FileEditor - Async file reader and editor
 *
 * Converts Python's file_tool.py to TypeScript
 */

import * as fs from 'fs/promises';
import * as pathModule from 'path';
import { tools } from './toolRegister';
import { ToolExecutionError } from '../types';

/**
 * FileEditor class for async file operations
 */
@tools({
    read: {
        description: 'Read the content of only one file. **Read one file at a time**.',
        params: [
            { name: 'path', type: 'string', description: 'The path of only one file, must include workspace directory' },
            {
                name: 'lineRange',
                type: 'string',
                description: "Line range, format 'start-end' or 'start'. If 'all', reads entire file.",
                optional: true,
            },
        ],
        returns: { type: 'string', description: 'The content of the file' },
    },
    write: {
        description: 'Write content to a file.',
        params: [
            { name: 'path', type: 'string', description: 'File path, must include workspace directory' },
            { name: 'content', type: 'string', description: 'Content to write' },
        ],
        returns: { type: 'string', description: 'Natural language description of operation result' },
    },
    find: {
        description: 'Find content matching specified pattern in file. **Folder searching is not supported.**',
        params: [
            { name: 'path', type: 'string', description: 'File path, must include workspace directory' },
            { name: 'pattern', type: 'string', description: 'Regex pattern to search for' },
        ],
        returns: { type: 'string', description: 'Natural language description of search results' },
    },
    findAndReplace: {
        description: 'Find and replace content matching specified pattern in file. **Folder searching is not supported.**',
        params: [
            { name: 'path', type: 'string', description: 'File path, must include workspace directory' },
            {
                name: 'pattern',
                type: 'string',
                description:
                    'Regex pattern to search for. Escape special chars [ ] ( ) . * + ? $ ^ | \\ with backslash. Example: CSS class "pt-[30]" → use pattern "pt-\\[30\\]"',
            },
            { name: 'replacement', type: 'string', description: 'Replacement text' },
        ],
        returns: { type: 'string', description: 'Natural language description of operation result' },
    },
    insert: {
        description: 'Insert content at specified line in file. **Folder searching is not supported.**',
        params: [
            { name: 'path', type: 'string', description: 'File path, must include workspace directory' },
            { name: 'content', type: 'string', description: 'Content to insert' },
            { name: 'line', type: 'integer', description: 'Line number to insert at. If None, appends to end of file.', optional: true },
        ],
        returns: { type: 'string', description: 'Natural language description of operation result' },
    },
})
export class FileEditor {
    async read(path: string, lineRange: string = 'all'): Promise<string> {
        // Check if file exists
        try {
            await fs.access(path);
        } catch {
            throw new ToolExecutionError(`File does not exist: ${path}`);
        }

        try {
            // Read file with UTF-8 encoding first
            let content: string;
            try {
                content = await fs.readFile(path, 'utf-8');
            } catch (error: any) {
                // If UTF-8 fails, try other encodings
                if (error.code === 'ENCODING_NOT_SUPPORTED' || error.message.includes('encoding')) {
                    // In Node.js, we'll try with latin1 which can handle binary data
                    const buffer = await fs.readFile(path);
                    content = buffer.toString('latin1');
                } else {
                    throw error;
                }
            }

            const lines = content.split('\n');

            if (lineRange === 'all') {
                return content;
            }

            // Parse line range
            if (lineRange.includes('-')) {
                try {
                    const [startStr, endStr] = lineRange.split('-', 2);
                    const start = parseInt(startStr) - 1; // Convert to 0-index
                    const end = parseInt(endStr);
                    if (start < 0 || end <= start) {
                        throw new ToolExecutionError(`Line range is invalid: ${lineRange}`);
                    }
                    const selectedLines = lines.slice(start, end);
                    return `Lines ${start + 1} to ${end} of file ${path}:\n` + selectedLines.join('\n');
                } catch (error: any) {
                    throw new ToolExecutionError(
                        `Invalid line range format when reading file ${path}: ${lineRange}, error: ${error.message}`
                    );
                }
            } else {
                try {
                    const lineNum = parseInt(lineRange) - 1; // Convert to 0-index
                    if (lineNum < 0) {
                        throw new ToolExecutionError(`Line number is less than 0: ${lineRange}`);
                    }
                    if (lineNum >= lines.length) {
                        throw new ToolExecutionError(`Line number ${lineNum + 1} exceeds file length ${lines.length}`);
                    }
                    return `Line ${lineNum + 1} of file ${path}:\n` + lines[lineNum];
                } catch (error: any) {
                    throw new ToolExecutionError(
                        `Invalid line number format when reading file ${path}: ${lineRange}, error: ${error.message}`
                    );
                }
            }
        } catch (error: any) {
            if (error instanceof ToolExecutionError) {
                throw error;
            }
            throw new ToolExecutionError(`Error reading file ${path}: ${error.message}`);
        }
    }

    async write(path: string, content: string): Promise<string> {
        try {
            // Ensure directory exists
            const dirPath = pathModule.dirname(path);
            if (dirPath) {
                await fs.mkdir(dirPath, { recursive: true });
            }

            // Write file
            await fs.writeFile(path, content, 'utf-8');

            const bytesWritten = Buffer.from(content, 'utf-8').length;
            return `Successfully wrote content to file ${path}, wrote ${bytesWritten} bytes`;
        } catch (error: any) {
            if (error.code === 'EACCES') {
                throw new ToolExecutionError(`No write permission: ${path}`);
            }
            throw new ToolExecutionError(`Error writing to file ${path}: ${error.message}`);
        }
    }

    async find(path: string, pattern: string): Promise<string> {
        // Check if file exists
        try {
            await fs.access(path);
        } catch {
            throw new ToolExecutionError(`File does not exist: ${path}`);
        }

        let compiledPattern: RegExp;
        try {
            compiledPattern = new RegExp(pattern, 'g');
        } catch (error: any) {
            throw new ToolExecutionError(`Invalid regex pattern: ${pattern}, error: ${error.message}`);
        }

        const matches: Array<{
            lineNumber: number;
            lineContent: string;
            match: string;
            startPos: number;
            endPos: number;
        }> = [];

        try {
            let content: string;
            try {
                content = await fs.readFile(path, 'utf-8');
            } catch (error: any) {
                // If UTF-8 fails, try other encodings
                if (error.code === 'ENCODING_NOT_SUPPORTED' || error.message.includes('encoding')) {
                    const buffer = await fs.readFile(path);
                    content = buffer.toString('latin1');
                } else {
                    throw error;
                }
            }

            const lines = content.split('\n');

            for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
                const line = lines[lineNumber];
                let match: RegExpExecArray | null;
                // Reset regex lastIndex for each line
                compiledPattern.lastIndex = 0;

                while ((match = compiledPattern.exec(line)) !== null) {
                    matches.push({
                        lineNumber: lineNumber + 1,
                        lineContent: line,
                        match: match[0],
                        startPos: match.index,
                        endPos: match.index + match[0].length,
                    });
                }
            }
        } catch (error: any) {
            throw new ToolExecutionError(`Error reading file ${path}: ${error.message}`);
        }

        if (matches.length === 0) {
            return `No content matching pattern '${pattern}' found in file ${path}`;
        }

        const resultLines = [`Found ${matches.length} matches in file ${path}:`];
        for (const match of matches) {
            resultLines.push(`Line ${match.lineNumber}: ${match.match} (position ${match.startPos}-${match.endPos})`);
            resultLines.push(`  Full line content: ${match.lineContent}`);
        }

        return resultLines.join('\n');
    }

    async findAndReplace(path: string, pattern: string, replacement: string): Promise<string> {
        // Check if file exists
        try {
            await fs.access(path);
        } catch {
            throw new ToolExecutionError(`File does not exist: ${path}`);
        }

        let compiledPattern: RegExp;
        try {
            compiledPattern = new RegExp(pattern, 'g');
        } catch (error: any) {
            throw new ToolExecutionError(`Invalid regex pattern ${pattern}, error: ${error.message}`);
        }

        let content: string;
        try {
            try {
                content = await fs.readFile(path, 'utf-8');
            } catch (error: any) {
                // If UTF-8 fails, try other encodings
                if (error.code === 'ENCODING_NOT_SUPPORTED' || error.message.includes('encoding')) {
                    const buffer = await fs.readFile(path);
                    content = buffer.toString('latin1');
                } else {
                    throw error;
                }
            }
        } catch (error: any) {
            throw new ToolExecutionError(`Error reading file ${path}: ${error.message}`);
        }

        // Execute replacement
        const newContent = content.replace(compiledPattern, replacement);
        const replacementCount = (content.match(compiledPattern) || []).length;

        // Calculate modified lines
        let modifiedLines = 0;
        if (replacementCount > 0) {
            const originalLines = content.split('\n');
            const newLines = newContent.split('\n');
            modifiedLines = originalLines.filter((line, index) => line !== newLines[index]).length;

            // Write back to file
            try {
                await fs.writeFile(path, newContent, 'utf-8');
            } catch (error: any) {
                if (error.code === 'EACCES') {
                    throw new ToolExecutionError(`No write permission: ${path}`);
                }
                throw new ToolExecutionError(`Error writing to file ${path}: ${error.message}`);
            }
        }

        return `In file ${path}, found and replaced pattern '${pattern}' with '${replacement}', successfully replaced ${replacementCount} occurrences, modified ${modifiedLines} lines`;
    }

    async insert(path: string, content: string, line?: number): Promise<string> {
        try {
            await fs.access(path);
        } catch {
            throw new ToolExecutionError(`File does not exist: ${path}`);
        }

        let lines: string[];
        try {
            let fileContent: string;
            try {
                fileContent = await fs.readFile(path, 'utf-8');
            } catch (error: any) {
                // If UTF-8 fails, try other encodings
                if (error.code === 'ENCODING_NOT_SUPPORTED' || error.message.includes('encoding')) {
                    const buffer = await fs.readFile(path);
                    fileContent = buffer.toString('latin1');
                } else {
                    throw error;
                }
            }
            lines = fileContent.split('\n');
        } catch (error: any) {
            throw new ToolExecutionError(`Error reading file ${path}: ${error.message}`);
        }

        let actionDesc: string;
        if (line === undefined) {
            lines.push(content);
            actionDesc = `Appended content to end of file ${path}`;
        } else {
            if (!(0 < line && line <= lines.length + 1)) {
                throw new ToolExecutionError(`Line number ${line} exceeds file ${path} bounds (1 to ${lines.length + 1})`);
            }
            lines.splice(line - 1, 0, content);
            actionDesc = `Inserted content at line ${line} of file ${path}`;
        }

        try {
            await fs.writeFile(path, lines.join('\n'), 'utf-8');
            return actionDesc;
        } catch (error: any) {
            if (error.code === 'EACCES') {
                throw new ToolExecutionError(`No write permission: ${path}`);
            }
            throw new ToolExecutionError(`Error writing to file ${path}: ${error.message}`);
        }
    }
}
