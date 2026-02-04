/**
 * Coding environment for agent management
 *
 * Converts Python's environment/coding.py to TypeScript
 */

import * as fs from 'fs';
import { BaseEnvironment } from './base';
import { Agent } from '../core/agent';
import { WORKSPACE_DIR } from '../configs/paths';
import { logger } from '../utils';

/**
 * Environment for coding
 */
export class CodingEnvironment extends BaseEnvironment {
    /**
     * Workspace directory
     */
    workspaceDir: string = '';

    constructor(agents: Agent[] = [], agentSkills: Record<string, string[]> = {}, workspaceDir: string = '') {
        super(agents, agentSkills);
        this.workspaceDir = workspaceDir;
        this.setWorkspaceDir();
    }

    /**
     * Set workspace directory after initialization
     */
    private setWorkspaceDir(): void {
        if (!this.workspaceDir) {
            this.workspaceDir = WORKSPACE_DIR;
        }

        // Create workspace directory if it doesn't exist
        if (!fs.existsSync(this.workspaceDir)) {
            fs.mkdirSync(this.workspaceDir, { recursive: true });
        } else {
            logger.debug(`Workspace directory already exists: ${this.workspaceDir}`);
        }

        // Inject workspace_dir into all agents' system
        for (const agent of this.agents) {
            if (!agent.systemPrompt.includes(this.workspaceDir)) {
                agent.systemPrompt =
                    agent.systemPrompt +
                    `\n\nYour workspace directory is: <workspace>${this.workspaceDir}</workspace>` +
                    `\n\n**Note**: your any output files must be saved in ${this.workspaceDir}`;
            }
        }

        logger.debug(`Setting workspace directory: ${this.workspaceDir}`);
        for (const agent of this.agents) {
            logger.debug(`Agent ${agent.name} system: ${agent.systemPrompt}`);
        }
    }
}
