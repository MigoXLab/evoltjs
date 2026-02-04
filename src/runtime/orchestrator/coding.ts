/**
 * Coding orchestrator for multi-agent management
 *
 * Renamed from CodingEnvironment to CodingOrchestrator in 0.2.x
 * Converts Python's runtime/orchestrator/coding.py to TypeScript
 */

import * as fs from 'fs';
import { BaseOrchestrator } from './base';
import { Agent } from '../../core/agent';
import { WORKSPACE_DIR } from '../../configs/paths';
import { logger } from '../../utils';

/**
 * Orchestrator for coding tasks
 *
 * Renamed from CodingEnvironment in Python 0.2.x.
 * Extends BaseOrchestrator with workspace directory management.
 */
export class CodingOrchestrator extends BaseOrchestrator {
    /**
     * Workspace directory
     */
    workspaceDir: string = '';

    constructor(options: {
        agents?: Agent[];
        agentSkills?: Record<string, string[]>;
        workspaceDir?: string;
        alwaysWaitHumanInput?: boolean;
        maxRounds?: number;
    } = {}) {
        const { workspaceDir = '', ...baseOptions } = options;
        super(baseOptions);
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

/**
 * @deprecated Use CodingOrchestrator instead. This alias is kept for backward compatibility.
 */
export const CodingEnvironment = CodingOrchestrator;
