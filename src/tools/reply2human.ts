/**
 * Reply2HumanTool - Tool for sending final human-facing replies
 *
 * Converts Python's reply2human.py to TypeScript
 */

import { tools } from './toolRegister';

/**
 * Reply2HumanTool class for sending human-facing replies
 */
@tools({
    reply: {
        description: 'Emit the reply text in a unified and formatted manner.',
        params: [{ name: 'reply', type: 'str', description: 'Raw reply text to be sent to the user.' }],
        returns: { type: 'str', description: 'The complete, formatted reply.' },
    },
})
export class Reply2HumanTool {
    async reply(reply: string): Promise<string> {
        return 'Reply complete!';
    }
}
