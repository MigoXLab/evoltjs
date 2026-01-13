/**
 * SkillsTool - Tool for managing skills
 *
 * Converts Python's tools/skills.py to TypeScript
 */

import * as fs from 'fs';
import * as path from 'path';
import { tools } from './toolRegister';
import { ToolExecutionError } from '../types';
import { FileEditor } from './fileTool';
import { SKILLS_DIR } from '../configs/paths';
import { logger } from '../utils';

/**
 * SkillsTool class for managing skills
 */
@tools({
    readSkillDescription: {
        description: 'Read the content of the skill description file.',
        params: [{ name: 'name', type: 'str', description: 'The name of the skill' }],
        returns: { type: 'str', description: 'The content of the skill description file' },
    },
    listSkills: {
        description: 'List the skills in the skills root directory',
        returns: { type: 'str', description: 'The list of skills with their descriptions' },
    },
})
export class SkillsTool {
    /**
     * Skills directory
     */
    skillsDir: string;

    constructor(skillsDir: string = SKILLS_DIR) {
        this.skillsDir = skillsDir;
    }

    /**
     * Read the content of the skill description file.
     *
     * Args:
     *     name (str): The name of the skill
     *
     * Returns:
     *     str: The content of the skill description file
     */
    async readSkillDescription(name: string): Promise<string> {
        const skillsPath = path.join(this.skillsDir, name, 'SKILL.md');

        if (!fs.existsSync(skillsPath)) {
            throw new ToolExecutionError(`Skill description file not found: ${skillsPath}`);
        }

        const fileEditor = new FileEditor();
        const skillDescription = await fileEditor.read(skillsPath);
        const formattedDescription = `<${name}.SkillDescription>${skillDescription}</${name}.SkillDescription>`;

        logger.debug(formattedDescription);
        return formattedDescription;
    }

    /**
     * List the skills in the skills root directory
     */
    async listSkills(): Promise<string> {
        if (!fs.existsSync(this.skillsDir)) {
            throw new ToolExecutionError(`Skills path not found: ${this.skillsDir}`);
        }

        // Read all SKILL.md files
        const skillsDict: Record<string, string> = {};
        const items = fs.readdirSync(this.skillsDir);

        for (const skillName of items) {
            const skillPath = path.join(this.skillsDir, skillName, 'SKILL.md');
            if (!fs.existsSync(skillPath)) {
                continue;
            }

            const fileEditor = new FileEditor();
            try {
                const skillContent = await fileEditor.read(skillPath, '1-3');
                skillsDict[skillName] = skillContent;
            } catch (error) {
                logger.warn(`Failed to read skill ${skillName}:`, error);
            }
        }

        const skillsInfo =
            '<SkillsInformation>' +
            Object.entries(skillsDict)
                .map(([skillName, content]) => `<${skillName}> ${content} </${skillName}>`)
                .join('\n') +
            '</SkillsInformation>';

        logger.debug(skillsInfo);
        return skillsInfo;
    }
}
