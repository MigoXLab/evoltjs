/**
 * ExtendStateMachineTool - Tool for writing ESM content to YAML files
 *
 * Converts Python's esm_tool.py to TypeScript
 */

import { tools } from './toolRegister';
import { ToolExecutionError } from '../types';
import { FileEditor } from './fileTool';

/**
 * ExtendStateMachineTool class for writing ESM content
 */
@tools({
    writeEsm: {
        description: 'Write the yaml format ExtendStateMachine(ESM) content to the yaml file',
        params: [
            {
                name: 'esmContent',
                type: 'str',
                description: 'The yaml format ESM content to write. follow the format of the ESM content.',
            },
            {
                name: 'filepath',
                type: 'str',
                description: 'The path to write the yaml format ESM content to.',
            },
        ],
        returns: {
            type: 'str',
            description: 'Successfully wrote the ESM content to the yaml file {filepath}',
        },
    },
})
export class ExtendStateMachineTool {
    async writeEsm(esmContent: string, filepath: string): Promise<string> {
        try {
            // For now, we'll just write the YAML content directly
            // In a full implementation, we would validate and parse the YAML
            const fileEditor = new FileEditor();
            await fileEditor.write(filepath, esmContent);
            return `Successfully wrote the ESM content to the yaml file ${filepath}`;
        } catch (error: any) {
            throw new ToolExecutionError(`Failed to write the ESM content to the yaml file ${filepath}: ${error.message}`);
        }
    }
}
