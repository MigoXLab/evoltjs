/**
 * Feedback class for environment evaluation results
 *
 * Corresponds to Python's schemas/feedback.py
 * Used by ReflexionOrchestrator for environment feedback
 */

import { Message } from './message';

/**
 * Feedback class representing evaluation results from an Environment
 *
 * Used in Reflexion loops where:
 * - Actor Agent generates/improves implementation
 * - Environment evaluates the implementation
 * - Feedback is returned with pass/fail status and detailed feedback message
 */
export class Feedback {
    /**
     * Whether the test/evaluation passed
     */
    isPassing: boolean;

    /**
     * Detailed feedback message
     */
    feedback: Message;

    constructor(isPassing: boolean = false, feedback?: Message) {
        this.isPassing = isPassing;
        this.feedback =
            feedback ||
            new Message('user', 'No feedback provided. Please check feedback settings.');

        // Validate feedback
        this._validate();
    }

    /**
     * Validate the feedback
     */
    private _validate(): void {
        if (!this.feedback.content) {
            throw new Error('Feedback content cannot be empty');
        }

        // Ensure tag contains 'feedback' (will be used when Message has tag property)
        if (this.feedback.tag !== undefined) {
            if (!this.feedback.tag) {
                this.feedback.tag = 'feedback';
            } else if (!this.feedback.tag.toLowerCase().includes('feedback')) {
                this.feedback.tag = `feedback_${this.feedback.tag}`;
            }
        }
    }

    /**
     * Convert feedback to a Message, optionally with pre/post content
     *
     * @param preContent - Content to prepend to the feedback
     * @param postContent - Content to append to the feedback
     * @returns Combined Message
     */
    toMessage(preContent: string = '', postContent: string = ''): Message {
        // Create a deep copy of the feedback message
        const feedbackMsg = new Message(
            this.feedback.role as 'system' | 'user' | 'assistant',
            this.feedback.content,
            this.feedback.images,
            this.feedback.type
        );

        // Copy additional properties if they exist
        if (this.feedback.tag !== undefined) {
            feedbackMsg.tag = this.feedback.tag;
        }

        let result = feedbackMsg;

        if (preContent) {
            const preMsg = new Message('user', preContent);
            result = this._mergeMessages(preMsg, result);
        }

        if (postContent) {
            const postMsg = new Message('user', postContent);
            result = this._mergeMessages(result, postMsg);
        }

        return result;
    }

    /**
     * Merge two messages into one
     */
    private _mergeMessages(first: Message, second: Message): Message {
        // Simple merge by concatenating content
        const merged = new Message(
            first.role as 'system' | 'user' | 'assistant',
            `${first.content}\n${second.content}`,
            first.images || second.images,
            first.type || second.type
        );

        // Copy tag from second message if present
        if ((second as any).tag !== undefined) {
            (merged as any).tag = (second as any).tag;
        }

        return merged;
    }

    /**
     * Format feedback for API calls
     *
     * @param preContent - Content to prepend
     * @param postContent - Content to append
     * @returns Formatted object for API
     */
    formatForApi(preContent: string = '', postContent: string = ''): Record<string, any> {
        const message = this.toMessage(preContent, postContent);
        return message.toObject();
    }

    /**
     * Create a passing feedback
     */
    static pass(content: string): Feedback {
        return new Feedback(true, new Message('user', content));
    }

    /**
     * Create a failing feedback
     */
    static fail(content: string): Feedback {
        return new Feedback(false, new Message('user', content));
    }
}
