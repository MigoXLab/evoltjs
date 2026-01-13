/**
 * TodoListTool - Tool for editing todo list file for project
 *
 * Converts Python's todo_list.py to TypeScript
 */

import { tools } from './toolRegister';
import { FileEditor } from './fileTool';

/**
 * TodoListTool class for managing todo lists
 */
@tools({
    write: {
        description: 'Use the tool to write todo list file for project.',
        params: [
            { name: 'projectName', type: 'str', description: 'The project name to write todo list file.' },
            { name: 'todoList', type: 'str', description: 'The todo list to write.' },
            { name: 'projectDir', type: 'str', description: 'The project directory to write todo list file.' },
        ],
        returns: { type: 'str', description: 'The complete todo list file result.' },
        examples: [
            'Good example:\n<TodoListTool.write><projectName>your project name here</projectName><todoList>- [ ] Write todo list file for project\n- [ ] Write todo list file for project</todoList><projectDir>your project directory here</projectDir></TodoListTool.write>',
        ],
    },
})
export class TodoListTool {
    async write(projectName: string, todoList: string, projectDir: string): Promise<string> {
        const content = `# ${projectName}\n## Todo List\n${todoList}`;
        const fileEditor = new FileEditor();
        await fileEditor.write(`${projectDir}/todo.md`, content);
        return `Write todo list file for project ${projectName} complete! The file is in ${projectDir}/todo.md`;
    }
}
