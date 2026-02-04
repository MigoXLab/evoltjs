/**
 * Base orchestrator for multi-agent management
 *
 * Renamed from BaseEnvironment to BaseOrchestrator in 0.2.x
 * Converts Python's runtime/orchestrator/base.py to TypeScript
 */

import { Agent } from '../../core/agent';
import { SkillsTool } from '../../tools/skills';
import { SKILLS_DIR } from '../../configs/paths';
import { logger } from '../../utils';

/**
 * Instruction type enumeration
 */
export enum InstructionType {
    VALID = 'valid',
    QUIT = 'quit',
    SEND_TO_ALL = 'sendToAll',
    NO_AGENT_NAME = 'noAgentName',
    NO_AVAILABLE_AGENT_NAME = 'noAvailableAgentName',
}

/**
 * Base orchestrator for multi-agent coordination
 *
 * Renamed from BaseEnvironment in Python 0.2.x.
 * The old "Environment" name now refers to evaluation environments used by Reflexion.
 */
export class BaseOrchestrator {
    /**
     * List of agents in the orchestrator
     */
    agents: Agent[] = [];

    /**
     * Assign skills to agent with their names
     */
    agentSkills: Record<string, string[]> = {};

    /**
     * Whether to always wait for human input
     */
    alwaysWaitHumanInput: boolean = false;

    /**
     * Maximum number of rounds for agent execution
     */
    maxRounds: number = 100;

    constructor(options: {
        agents?: Agent[];
        agentSkills?: Record<string, string[]>;
        alwaysWaitHumanInput?: boolean;
        maxRounds?: number;
    } = {}) {
        const {
            agents = [],
            agentSkills = {},
            alwaysWaitHumanInput = false,
            maxRounds = 100,
        } = options;

        this.agents = agents;
        this.agentSkills = agentSkills;
        this.alwaysWaitHumanInput = alwaysWaitHumanInput;
        this.maxRounds = maxRounds;
        this.setAgentSkills();
    }

    /**
     * Set agent skills after initialization
     */
    private setAgentSkills(): void {
        if (this.agents.length === 0 || Object.keys(this.agentSkills).length === 0) {
            return;
        }

        const skiller = new SkillsTool(SKILLS_DIR);

        // Handle "all" keyword for assigning skills to all agents
        if ('all' in this.agentSkills) {
            for (const agent of this.agents) {
                this.agentSkills[agent.name] = this.agentSkills['all'];
            }
            delete this.agentSkills['all'];
        }

        logger.debug(`Assigning skills to agents: ${JSON.stringify(this.agentSkills)}`);

        // Assign skills to specified agents
        for (const [agentName, skillNames] of Object.entries(this.agentSkills)) {
            for (const agent of this.agents) {
                if (agent.name === agentName) {
                    const skillDescriptions: string[] = [];

                    // Read skill descriptions asynchronously
                    (async () => {
                        for (const skillName of skillNames) {
                            try {
                                const skillDescription = await skiller.readSkillDescription(skillName);
                                skillDescriptions.push(skillDescription);
                            } catch (error) {
                                logger.warn(`Failed to read skill description for ${skillName}:`, error);
                            }
                        }

                        const skillDescription =
                            '\n--- <SKILLS START> ---\n' + skillDescriptions.join('\n-----\n') + '\n--- <SKILLS END> ---\n';

                        agent.systemPrompt = agent.systemPrompt + skillDescription;
                    })();
                }
            }
        }
    }

    /**
     * Check if instruction has agent name
     */
    hasAgentName(instruction: string): boolean {
        if (!instruction.includes('@')) {
            return false;
        }

        for (const agent of this.agents) {
            if (instruction.includes(`@${agent.name}`)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Post process instruction
     */
    postProcessInstruction(instruction: string, agentNames: string[]): [InstructionType, string] {
        // Direct return instructions
        if (['/q', 'exit', 'quit'].includes(instruction.toLowerCase()) || agentNames.length === 0) {
            return [InstructionType.QUIT, instruction];
        }

        // Single agent case: add @agent_name
        if (agentNames.length === 1) {
            return [InstructionType.VALID, `${instruction}@${agentNames[0]}`];
        }

        // Multiple agents case: ensure @agent_name is present
        if (instruction.includes('@all')) {
            return [InstructionType.SEND_TO_ALL, instruction];
        }

        if (this.hasAgentName(instruction)) {
            return [InstructionType.VALID, instruction];
        }

        return [InstructionType.NO_AVAILABLE_AGENT_NAME, instruction];
    }

    /**
     * Shutdown all agent executors
     */
    async shutdownAllExecutors(options?: { wait?: boolean }): Promise<void> {
        const wait = options?.wait ?? true;
        for (const agent of this.agents) {
            // Future: when agents have executors, shut them down here
            // await agent.executor?.shutdown({ wait });
        }
        logger.debug('All agent executors shutdown');
    }

    /**
     * Run with a single goal until completion (non-interactive mode)
     */
    async runGoal(goal: string): Promise<void> {
        if (this.agents.length === 0) {
            logger.error('No agents in the orchestrator.');
            return;
        }

        const [instructionType, processedInstruction] = this.postProcessInstruction(
            goal,
            this.agents.map(agent => agent.name)
        );

        if (instructionType === InstructionType.QUIT) {
            logger.info('Invalid goal instruction.');
            return;
        }

        if (instructionType === InstructionType.NO_AVAILABLE_AGENT_NAME) {
            logger.warn("No available agent name in instruction. Please provide instruction with '@agent_name'.");
            return;
        }

        logger.info('Goal:', goal);
        logger.info('Processing goal...\n');

        for (const agent of this.agents) {
            if (instructionType === InstructionType.SEND_TO_ALL || processedInstruction.includes(`@${agent.name}`)) {
                try {
                    const response = await agent.run(processedInstruction);
                    logger.info(`\n> Agent ${agent.name} completed the goal.`);
                    logger.info(`Final response: ${response}`);
                } catch (error) {
                    logger.error(`Error running agent ${agent.name}:`, error);
                }
            }
        }
    }

    /**
     * Run the orchestrator (interactive mode)
     */
    async run(instruction?: string): Promise<void> {
        // If instruction provided, run in non-interactive mode
        if (instruction) {
            await this.runGoal(instruction);
            return;
        }

        // Interactive mode
        const readline = await import('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        const question = (prompt: string): Promise<string> => {
            return new Promise(resolve => {
                rl.question(prompt, resolve);
            });
        };

        try {
            while (true) {
                try {
                    // Get instruction from user
                    let userInstruction: string;
                    if (this.agents.length === 0) {
                        logger.error('No agents in the orchestrator.');
                        break;
                    } else if (this.agents.length === 1) {
                        userInstruction = await question("Enter your instruction (or '/q' to quit): ");
                    } else {
                        const agentNames = this.agents.map(agent => agent.name).join(', ');
                        userInstruction = await question(
                            `Enter your instruction with '@agent_name' (or '/q' to quit), available agents: ${agentNames}: `
                        );
                    }

                    const [instructionType, processedInstruction] = this.postProcessInstruction(
                        userInstruction,
                        this.agents.map(agent => agent.name)
                    );

                    if (instructionType === InstructionType.QUIT) {
                        logger.info('Quitting...');
                        break;
                    } else if (instructionType === InstructionType.NO_AVAILABLE_AGENT_NAME) {
                        logger.warn("No available agent name in instruction. Please enter your instruction with '@agent_name'.");
                        continue;
                    }

                    logger.info('Processing your request...');
                    for (const agent of this.agents) {
                        if (instructionType === InstructionType.SEND_TO_ALL || processedInstruction.includes(`@${agent.name}`)) {
                            const response = await agent.run(processedInstruction);
                            logger.info(`Agent ${agent.name} response:`, response);
                        }
                    }
                } catch (error) {
                    logger.error('Error processing instruction:', error);
                }
            }
        } finally {
            rl.close();
        }
    }
}

/**
 * @deprecated Use BaseOrchestrator instead. This alias is kept for backward compatibility.
 */
export const BaseEnvironment = BaseOrchestrator;
