/**
 * Base orchestrator for multi-agent management
 *
 * Converts Python's runtime/orchestrator/base.py to TypeScript
 */

import * as fs from 'fs';
import * as readline from 'readline';
import { Agent } from '../../core/agent';
import { logger } from '../../utils';

/**
 * Read instruction from terminal or instruction file.
 *
 * - If EVOLT_INSTRUCTION_FILE env var is set and the file exists with content,
 *   reads one line from it (alternative for integrated terminals that can't accept input).
 * - Otherwise reads from stdin via readline.
 */
async function readInstructionFromTerminal(prompt: string): Promise<string> {
    // Try reading from EVOLT_INSTRUCTION_FILE first
    const instructionFile = (process.env.EVOLT_INSTRUCTION_FILE || '').trim();
    if (instructionFile && fs.existsSync(instructionFile)) {
        try {
            const content = fs.readFileSync(instructionFile, 'utf-8');
            const lines = content.split('\n');
            if (lines.length > 0) {
                const instruction = (lines[0] || '').trim();
                if (instruction) {
                    // Remove the first line from the file
                    fs.writeFileSync(instructionFile, lines.slice(1).join('\n'), 'utf-8');
                    logger.debug(`Read instruction from EVOLT_INSTRUCTION_FILE: ${instruction.substring(0, 50)}...`);
                    return instruction;
                }
            }
        } catch {
            // Fall through to readline
        }
    }

    // Read from stdin via readline
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise<string>((resolve) => {
        rl.question(prompt, (answer) => {
            rl.close();
            resolve((answer || '').trim());
        });
    });
}

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
 * Args:
 *   agents: Agent[], list of agents
 *   alwaysWaitHumanInput: boolean, whether to always wait for human input after each agent round
 *   maxRounds: number, maximum number of conversation rounds
 */
export class BaseOrchestrator {
    /**
     * List of agents in the orchestrator
     */
    agents: Agent[] = [];

    /**
     * Whether to always wait for human input after each agent round
     */
    alwaysWaitHumanInput: boolean = true;

    /**
     * Maximum number of conversation rounds
     */
    maxRounds: number = 1;

    constructor(options: {
        agents?: Agent[];
        alwaysWaitHumanInput?: boolean;
        maxRounds?: number;
    } = {}) {
        const {
            agents = [],
            alwaysWaitHumanInput = true,
            maxRounds = 1,
        } = options;

        this.agents = agents;
        this.alwaysWaitHumanInput = alwaysWaitHumanInput;
        this.maxRounds = maxRounds;

        // Equivalent to Python model_validator: set_max_rounds
        // If not always waiting for human input, force maxRounds to 1 for non-blocking mode
        if (!this.alwaysWaitHumanInput) {
            this.maxRounds = 1;
        }

        // Equivalent to Python model_validator: disable_agent_executor_auto_shutdown
        for (const agent of this.agents) {
            agent.autoShutdownExecutor = false;
        }
    }

    /**
     * Check if instruction contains an agent name
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
        // Quit conditions
        if ((instruction && ['/q', 'exit', 'quit'].includes(instruction.toLowerCase())) || agentNames.length === 0) {
            return [InstructionType.QUIT, instruction];
        }

        // Single agent case: automatically add @agent_name
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
        logger.debug('Shutting down all executors...');
        for (const agent of this.agents) {
            if (agent.executor !== null) {
                try {
                    await agent.executor.shutdown({ wait });
                } catch (error) {
                    logger.warn(`Error shutting down executor for agent ${agent.name}: ${error}`);
                }
            }
        }
        logger.debug('All executors shut down.');
    }

    /**
     * Run the orchestrator with the given instruction.
     *
     * @param instruction - Optional instruction to execute. When alwaysWaitHumanInput is true,
     *                      this is ignored and input is read from terminal instead.
     */
    async run(instruction?: string): Promise<void> {
        while (this.maxRounds > 0) {
            try {
                // Check for agents
                if (this.agents.length === 0) {
                    logger.error('No agents in the orchestrator.');
                    await this.shutdownAllExecutors({ wait: true });
                    break;
                }

                // Get instruction from user if always waiting for human input
                if (this.alwaysWaitHumanInput) {
                    const agentNames = this.agents.map(agent => agent.name).join(', ');
                    const prompt = `Enter your instruction with '@agent_name' (or '/q' to quit), available agents: ${agentNames}: `;
                    instruction = await readInstructionFromTerminal(prompt);
                }

                let [instructionType, processedInstruction] = this.postProcessInstruction(
                    instruction || '',
                    this.agents.map(agent => agent.name),
                );

                logger.info('Processing your request...');
                for (const agent of this.agents) {
                    if (
                        instructionType === InstructionType.SEND_TO_ALL ||
                        processedInstruction.includes(`@${agent.name}`)
                    ) {
                        const response = await agent.run(processedInstruction);
                        logger.info(`Agent ${agent.name} response: ${response}`);
                    }
                }

                // Decrement rounds
                this.maxRounds -= 1;

                // If rounds exhausted, force quit
                if (this.maxRounds <= 0) {
                    instructionType = InstructionType.QUIT;
                }

                // Check if should quit or continue
                if (instructionType === InstructionType.QUIT) {
                    logger.info('Quitting...');
                    // Don't wait for tasks on user-initiated quit for fast exit
                    await this.shutdownAllExecutors({ wait: false });
                    break;
                } else if (instructionType === InstructionType.NO_AVAILABLE_AGENT_NAME) {
                    logger.warn(
                        "No available agent name in instruction. Please enter your instruction with '@agent_name'.",
                    );
                    continue;
                }
            } catch (error) {
                // Handle interruption (e.g. SIGINT caught as error)
                if (error instanceof Error && error.message.includes('interrupted')) {
                    logger.warn('User interrupted the execution.');
                    continue;
                }
                logger.error(`Error during execution: ${error}`);
                continue;
            }
        }
    }
}

/**
 * @deprecated Use BaseOrchestrator instead. This alias is kept for backward compatibility.
 */
export const BaseEnvironment = BaseOrchestrator;
