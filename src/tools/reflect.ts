/**
 * ReflectTool - Tool for reflecting on the state
 *
 * Converts Python's reflect.py to TypeScript
 */

import { tools } from './toolRegister';

/**
 * ReflectTool class for state reflection
 */
@tools({
    reflect: {
        description: 'Use the tool to reflect on the state.',
        params: [{ name: 'state', type: 'str', description: 'The state to reflect on.' }],
        returns: { type: 'str', description: 'The reflected result.' },
    },
})
export class ReflectTool {
    async reflect(state: string): Promise<string> {
        return 'Reflected complete!';
    }

    /**
     * Set the reflection for agent to see.
     */
    setReflection(reflection: string): string {
        return `<ReflectTool.setReflection><reflection>${reflection}</reflection></ReflectTool.setReflection>`;
    }
}
