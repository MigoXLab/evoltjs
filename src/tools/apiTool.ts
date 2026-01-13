/**
 * ApiTool - Tool for writing API files and generating Golang files
 *
 * Converts Python's api_tool.py to TypeScript
 */

import { tools } from './toolRegister';
import { FileEditor } from './fileTool';
import { CommandLineTool } from './cmdTool';

/**
 * ApiTool class for API file operations
 */
@tools({
    write: {
        description: 'Use the tool to write api file based on goctl.',
        params: [
            {
                name: 'apiFilePath',
                type: 'str',
                description: 'The api file path to write.',
            },
            {
                name: 'apiContent',
                type: 'str',
                description: 'The api content to write.',
            },
        ],
        returns: { type: 'str', description: 'The complete api file result.' },
        examples: [
            'Good example:\n<ApiTool.write><apiFilePath>to/your/workspace/your_api_file_name.api</apiFilePath><apiContent>type ( Request { Name string `path:"name,options=[you,me]"` } Response { Message string `json:"message"` } ) service greet-api { @handler GreetHandler get /greet/from/:name (Request) returns (Response) }</apiContent></ApiTool.write>',
        ],
    },
    generateGolangFilesFromApi: {
        description: 'Use the tool to generate golang files from api file.',
        params: [
            {
                name: 'apiFilePath',
                type: 'str',
                description: 'The api file path to generate golang files.',
            },
            {
                name: 'dir',
                type: 'str',
                description: 'The directory to generate golang files.',
            },
        ],
        returns: { type: 'str', description: 'The complete golang files result.' },
    },
})
export class ApiTool {
    async write(apiFilePath: string, apiContent: string): Promise<string> {
        const fileEditor = new FileEditor();
        await fileEditor.write(apiFilePath, apiContent);
        return `Write api file ${apiFilePath} complete!`;
    }

    async generateGolangFilesFromApi(apiFilePath: string, dir: string): Promise<string> {
        const cmdTool = new CommandLineTool();
        await cmdTool.execute(`goctl api go -api ${apiFilePath} -dir ${dir}`);
        return `Generate golang files from ${apiFilePath} complete! The files are in ${dir}`;
    }
}
