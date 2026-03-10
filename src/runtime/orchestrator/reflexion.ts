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
import { UserMessage, AssistantMessage } from '../../schemas/message';
import { logger } from '../../utils';
import { ChatCompletionMessageParam } from 'openai/resources/index';
import * as fs from 'fs';

/**
 * Configuration for the critic agent
 */
export type CriticAgentConfig = AgentConfig & {
    saveSelfReflection: boolean;
    postContent?: string;
};

/**
 * Configuration for the actor agent
 */
export type ActorAgentConfig = AgentConfig;

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
}

/**
 * Default system prompt for critic agent
 */
const CRITIC_SYSTEM_PROMPT = `
    You will be given a {taskType} implementation and a series of {feedbackType}.
    Your goal is to write a few sentences to explain why your implementation is wrong as indicated by the {feedbackType}.
    You will need this as a hint when you try again later.
    Only provide the few sentence description in your answer, not the implementation.\n\n-----`;

/**
 * Default system prompt for actor agent
 */
const ACTOR_SYSTEM_PROMPT = `
    You will be given your past {taskType} implementation, a series of {feedbackType}, and a hint to change the implementation appropriately. 
    Write your full implementation.`;

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
    private taskType: string;
    private feedbackType: string;
    private environment: Environment;
    private criticAgentConfig: CriticAgentConfig;
    private actorAgentConfig: ActorAgentConfig;

    constructor(options: ReflexionOrchestratorOptions) {
        this.taskType = options.taskType;
        this.feedbackType = options.feedbackType;
        this.environment = options.environment;
        const criticAgentConfig = options.criticAgentConfig;
        const actorAgentConfig = options.actorAgentConfig;

        // critic agent config
        this.criticAgentConfig = {
            name: criticAgentConfig?.name ?? 'CriticAgent',
            profile: criticAgentConfig?.profile ?? 'You are an AI assistant.',
            tools: criticAgentConfig?.tools ?? ['CommandLineTool.execute', 'FileEditor.write', 'FileEditor.read'],
            udfModelName: criticAgentConfig?.udfModelName ?? 'deepseek',
            workspaceDir: criticAgentConfig?.workspaceDir ?? '',
            fewShot: criticAgentConfig?.fewShot ?? '',
            verbose: criticAgentConfig?.verbose ?? false,
            saveSelfReflection: criticAgentConfig?.saveSelfReflection ?? false,
            postContent: criticAgentConfig?.postContent ?? '',
        };

        // actor agent config
        this.actorAgentConfig = {
            name: actorAgentConfig?.name ?? 'ActorAgent',
            profile: actorAgentConfig?.profile ?? 'You are an AI engineer.',
            tools: actorAgentConfig?.tools ?? ['CommandLineTool.execute', 'FileEditor.write', 'ThinkTool.execute'],
            udfModelName: actorAgentConfig?.udfModelName ?? 'deepseek',
            workspaceDir: actorAgentConfig?.workspaceDir ?? '',
            fewShot: actorAgentConfig?.fewShot ?? '',
            verbose: actorAgentConfig?.verbose ?? false,
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
    private buildCriticHistory(impl: string, feedback: Feedback): ChatCompletionMessageParam[] {
        let pre_content = '';
        if (impl.length < 200 && fs.existsSync(impl)) {
            pre_content = `The impl file is: ${impl}\n\n`;
            const impl_content = fs.readFileSync(impl, 'utf-8');
            pre_content += `The impl content is: <impl_content>\n${impl_content}\n</impl_content>\n\n`;
        } else {
            pre_content += `The impl is a directory, the files in the directory are: ${impl}\n\n`;
        }

        // add post content here
        const post_content = `${this.criticAgentConfig.postContent || ''}\nDo not change the impl file, just use tools to find the correct way and give the self-reflection.`;

        return [feedback.message.formatForApi(pre_content, post_content)];
    }

    /**
     * Build history message for actor agent
     */
    private buildActorHistory(
        feedback: ChatCompletionMessageParam,
        selfReflection: string,
        improvedImplPath: string
    ): ChatCompletionMessageParam[] {
        const messages: ChatCompletionMessageParam[] = [];

        if (this.actorAgentConfig.fewShot) {
            messages.push(new UserMessage({ content: this.actorAgentConfig.fewShot }).formatForApi());
        }

        messages.push(feedback);
        messages.push(new AssistantMessage({ content: `<self_reflection>\n${selfReflection}\n</self_reflection>` }).formatForApi());
        messages.push(
            new UserMessage({ content: `Use ThinkTool to recap the feedback and self-reflection, think how to improve the previous impl, and use FileEditor tools to write your improved implementation, and saved it to the file \`${improvedImplPath}\`.` })
                .formatForApi()
        );

        return messages;
    }

    /**
     * Run the reflexion loop
     */
    async run(maxIterations: number = 3) {
        // Create agents
        const actor = new Agent({
            system: this.createActorSystemPrompt(),
            ...this.actorAgentConfig,
        });

        const critic = new Agent({
            system: this.createCriticSystemPrompt(),
            ...this.criticAgentConfig,
        });

        let currentRound = 0;
        let feedback = await this.environment.step(this.environment.initStepKwargs);

        // Reflexion loop
        while (!feedback.isPassing && currentRound < maxIterations) {
            logger.debug(`Feedback: ${feedback.message.content}`);

            // Critic agent generates reflection
            const criticHistory = this.buildCriticHistory(
                this.environment.improvedImpl,
                feedback
            );
            critic.resetHistory(criticHistory);

            const criticResult = await critic.run();
            let selfReflection = criticResult.replace("<TaskCompletion>", "<self-reflection>").replace("</TaskCompletion>", "</self-reflection>").trim();

            if (this.criticAgentConfig.saveSelfReflection) {
                selfReflection = fs.readFileSync(this.criticAgentConfig.workspaceDir + '/self_reflection.md', 'utf-8');
            }

            logger.info(`Critic agent self-reflection: ${selfReflection}`);

            // Actor agent generates improved implementation
            const actorHistory = this.buildActorHistory(
                criticHistory[criticHistory.length - 1],
                selfReflection,
                this.environment.improvedImpl
            );
            actor.resetHistory(actorHistory);

            const actorResult = await actor.run();
            const improvedImplSummary = actorResult.replace("<TaskCompletion>", "<improved-impl-summary>").replace("</TaskCompletion>", "</improved-impl-summary>").trim();

            logger.info(`Actor agent improved impl summary: ${improvedImplSummary}`);

            // finalOutput = improvedImplSummary;

            // Next round
            feedback = await this.environment.step(this.environment.improvedStepKwargs);
            currentRound++;
        }

        logger.info(`Reflection task completed in ${currentRound} rounds`);

        // Cleanup: shutdown environment
        try {
            await this.environment.shutdown();
            logger.info('Environment shutdown completed');
            await this.environment.wait();
            logger.info('Environment tasks completed');
        } catch (error) {
            logger.warn(`Error during environment shutdown: ${error}`);
        }

        // use the shutdownAllExecutors method in base.ts
        try {
            if (actor.executor) {
                await actor.executor.shutdown({ wait: true });
            }
            if (critic.executor) {
                await critic.executor.shutdown({ wait: true });
            }
        } catch (error) {
            logger.warn(`Error during executor shutdown: ${error}`);
        }
    }
}
