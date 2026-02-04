/**
 * Reflexion Orchestrator
 *
 * Orchestrator for self-improvement loops using actor-critic pattern.
 *
 * Corresponds to Python's runtime/orchestrator/reflexion.py
 */

import { Agent } from '../../core/agent';
import { AgentConfig } from '../../core/agentConfig';
import { Environment } from '../environment';
import { Feedback } from '../../schemas/feedback';
import { Message } from '../../schemas/message';
import { logger } from '../../utils';

/**
 * Configuration for the critic agent
 */
export interface CriticAgentConfig extends Partial<AgentConfig> {
    name?: string;
    profile?: string;
    tools?: string[];
    udfModelName?: string;
    workspaceDir?: string;
    fewShot?: string;
    verbose?: boolean | number;
    saveSelfReflection?: boolean;
    postContent?: string;
}

/**
 * Configuration for the actor agent
 */
export interface ActorAgentConfig extends Partial<AgentConfig> {
    name?: string;
    profile?: string;
    tools?: string[];
    udfModelName?: string;
    workspaceDir?: string;
    fewShot?: string;
    verbose?: boolean | number;
}

/**
 * Options for ReflexionOrchestrator
 */
export interface ReflexionOrchestratorOptions {
    /**
     * The task description
     */
    task: string;

    /**
     * The type of task (e.g., "coding", "writing")
     */
    taskType: string;

    /**
     * The type of feedback expected
     */
    feedbackType: string;

    /**
     * The evaluation environment
     */
    environment: Environment;

    /**
     * Configuration for the critic agent
     */
    criticAgentConfig?: CriticAgentConfig;

    /**
     * Configuration for the actor agent
     */
    actorAgentConfig?: ActorAgentConfig;

    /**
     * Maximum number of reflection rounds
     */
    maxIterations?: number;
}

/**
 * Result of a reflexion run
 */
export interface ReflexionResult {
    success: boolean;
    iterations: number;
    finalOutput: string;
}

/**
 * Default system prompt for critic agent
 */
const CRITIC_SYSTEM_PROMPT = `You are a critic agent specialized in {taskType} tasks.

Your role is to:
1. Analyze the implementation provided
2. Identify issues and areas for improvement
3. Provide constructive feedback in the form of {feedbackType}
4. Suggest specific improvements

Be thorough but constructive in your feedback.`;

/**
 * Default system prompt for actor agent
 */
const ACTOR_SYSTEM_PROMPT = `You are an actor agent specialized in {taskType} tasks.

Your role is to:
1. Review the feedback and self-reflection
2. Improve the implementation based on the suggestions
3. Produce a better version of the code/output

Focus on addressing all issues mentioned in the feedback.`;

/**
 * Reflexion Orchestrator for self-improvement loops
 *
 * Implements the Reflexion pattern:
 * 1. Environment evaluates current implementation
 * 2. Critic agent generates self-reflection based on feedback
 * 3. Actor agent improves implementation based on reflection
 * 4. Repeat until passing or max iterations reached
 */
export class ReflexionOrchestrator {
    private task: string;
    private taskType: string;
    private feedbackType: string;
    private environment: Environment;
    private criticAgentConfig: CriticAgentConfig;
    private actorAgentConfig: ActorAgentConfig;
    private maxIterations: number;

    constructor(options: ReflexionOrchestratorOptions) {
        this.task = options.task;
        this.taskType = options.taskType;
        this.feedbackType = options.feedbackType;
        this.environment = options.environment;
        this.maxIterations = options.maxIterations ?? 3;

        // Default critic agent config
        this.criticAgentConfig = {
            name: 'CriticAgent',
            profile: 'You are an AI assistant.',
            tools: ['CommandLineTool.execute', 'FileEditor.write', 'FileEditor.read'],
            udfModelName: 'deepseek',
            workspaceDir: '',
            fewShot: '',
            verbose: false,
            saveSelfReflection: false,
            postContent: '',
            ...options.criticAgentConfig,
        };

        // Default actor agent config
        this.actorAgentConfig = {
            name: 'ActorAgent',
            profile: 'You are an AI engineer.',
            tools: ['CommandLineTool.execute', 'FileEditor.write', 'ThinkTool.execute'],
            udfModelName: 'deepseek',
            workspaceDir: '',
            fewShot: '',
            verbose: false,
            ...options.actorAgentConfig,
        };
    }

    /**
     * Create system prompt for critic agent
     */
    private createCriticSystemPrompt(): string {
        return CRITIC_SYSTEM_PROMPT
            .replace('{taskType}', this.taskType)
            .replace('{feedbackType}', this.feedbackType);
    }

    /**
     * Create system prompt for actor agent
     */
    private createActorSystemPrompt(): string {
        return ACTOR_SYSTEM_PROMPT
            .replace('{taskType}', this.taskType)
            .replace('{feedbackType}', this.feedbackType);
    }

    /**
     * Build history message for critic agent
     */
    private buildCriticHistoryMessage(impl: string, feedback: Feedback): Message[] {
        const preContent = this.criticAgentConfig.workspaceDir
            ? `Your workspace directory is: ${this.criticAgentConfig.workspaceDir}\n\n`
            : '';

        const postContent = (this.criticAgentConfig.postContent || '') +
            '\nDo not change the impl file, just use tools to find the correct way and give the self-reflection.';

        return [feedback.toMessage(preContent, postContent)];
    }

    /**
     * Build history message for actor agent
     */
    private buildActorHistoryMessage(
        feedback: Message,
        selfReflection: string,
        improvedImplPath: string
    ): Message[] {
        const messages: Message[] = [];

        if (this.actorAgentConfig.fewShot) {
            messages.push(new Message('user', this.actorAgentConfig.fewShot));
        }

        messages.push(feedback);
        messages.push(new Message(
            'assistant',
            `<self_reflection>\n${selfReflection}\n</self_reflection>`
        ));
        messages.push(new Message(
            'user',
            `Use ThinkTool to recap the feedback and self-reflection, think how to improve the previous impl, and use FileEditor tools to write your improved implementation, and saved it to the file \`${improvedImplPath}\`.`
        ));

        return messages;
    }

    /**
     * Run the reflexion loop
     */
    async run(): Promise<ReflexionResult> {
        // Create agents
        const actor = new Agent({
            name: this.actorAgentConfig.name || 'ActorAgent',
            profile: this.actorAgentConfig.profile || 'You are an AI engineer.',
            system: this.createActorSystemPrompt(),
            tools: this.actorAgentConfig.tools,
            modelConfig: this.actorAgentConfig.udfModelName,
            verbose: this.actorAgentConfig.verbose,
        });

        const critic = new Agent({
            name: this.criticAgentConfig.name || 'CriticAgent',
            profile: this.criticAgentConfig.profile || 'You are an AI assistant.',
            system: this.createCriticSystemPrompt(),
            tools: this.criticAgentConfig.tools,
            modelConfig: this.criticAgentConfig.udfModelName,
            verbose: this.criticAgentConfig.verbose,
        });

        let currentRound = 0;
        let feedback = await this.environment.step(this.environment.initStepKwargs);
        let finalOutput = '';

        // Reflexion loop
        while (!feedback.isPassing && currentRound < this.maxIterations) {
            logger.debug(`Feedback: ${feedback.feedback.content}`);

            // Critic agent generates reflection
            const criticHistoryMsgs = this.buildCriticHistoryMessage(
                this.environment.improvedImpl,
                feedback
            );

            let selfReflection = await critic.run(
                criticHistoryMsgs[0].content
            );

            // Clean up task completion tags
            if (selfReflection.includes('<TaskCompletion>')) {
                selfReflection = selfReflection
                    .replace(/<TaskCompletion>/g, '<self-reflection>')
                    .replace(/<\/TaskCompletion>/g, '</self-reflection>')
                    .trim();
            }

            logger.info(`Critic agent self-reflection: ${selfReflection}`);

            // Actor agent generates improved implementation
            const actorHistoryMsgs = this.buildActorHistoryMessage(
                criticHistoryMsgs[criticHistoryMsgs.length - 1],
                selfReflection,
                this.environment.improvedImpl
            );

            let improvedImplSummary = await actor.run(
                actorHistoryMsgs[actorHistoryMsgs.length - 1].content
            );

            // Clean up task completion tags
            if (improvedImplSummary.includes('<TaskCompletion>')) {
                improvedImplSummary = improvedImplSummary
                    .replace(/<TaskCompletion>/g, '<improved-impl-summary>')
                    .replace(/<\/TaskCompletion>/g, '</improved-impl-summary>')
                    .trim();
            }

            logger.info(`Actor agent improved impl summary: ${improvedImplSummary}`);
            finalOutput = improvedImplSummary;

            // Next round
            feedback = await this.environment.step(this.environment.improvedStepKwargs);
            currentRound++;
        }

        logger.info(`Reflection task completed in ${currentRound} rounds`);

        // Cleanup: shutdown environment
        try {
            await this.environment.shutdown();
            logger.info('Environment shutdown completed');
        } catch (error) {
            logger.warn(`Error during environment shutdown: ${error}`);
        }

        return {
            success: feedback.isPassing,
            iterations: currentRound,
            finalOutput,
        };
    }
}
