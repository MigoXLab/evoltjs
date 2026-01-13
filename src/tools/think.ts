/**
 * ThinkTool - Tool for internal reasoning without executing external actions
 *
 * TypeScript-native version using configuration objects
 */

import { tools } from './toolRegister';

/**
 * ThinkTool class for internal reasoning
 */
@tools({
    execute: {
        description: 'Use the tool to think about something when complex reasoning.',
        params: [
            {
                name: 'thought',
                type: 'str',
                description: 'The thought to think about.',
            },
        ],
        returns: {
            type: 'str',
            description: 'The complete thought result.',
        },
        examples: [
            'Good example:\n<ThinkTool.execute><thought> your thought here </thought></ThinkTool.execute>',
            'Bad example:\n<ThinkTool.execute>{"thought":"your thought here"}</ThinkTool.execute>',
        ],
    },
})
export class ThinkTool {
    async execute(thought: string): Promise<string> {
        return 'Thinking complete!';
    }
}
