/**
 * Feedback class for environment evaluation results
 *
 * Corresponds to Python's schemas/feedback.py
 * Used by ReflexionOrchestrator for environment feedback
 */

import { UserMessage } from './message';

/**
 * Feedback class representing evaluation results from an Environment
 *
 * Used in Reflexion loops where:
 * - Actor Agent generates/improves implementation
 * - Environment evaluates the implementation
 * - Feedback is returned with pass/fail status and detailed feedback message
 */
export class Feedback {
    /** Whether the test/evaluation passed */
    isPassing: boolean;

    /**
     * Detailed feedback message
     */
    message: UserMessage;

    constructor(isPassing: boolean = false, feedback?: UserMessage) {
        this.isPassing = isPassing;
        this.message =
            feedback ||
            new UserMessage({ content: 'No feedback provided. Please check feedback settings.' });

        this._validate();
        this._ensureFeedbackTag();
    }

    // ------------------------------------------------------------------
    // Validation
    // ------------------------------------------------------------------

    private _validate(): void {
        if (!this.message.content) {
            throw new Error('Feedback content cannot be empty');
        }
    }

    /** Ensure the tag contains 'feedback'. */
    private _ensureFeedbackTag(): void {
        if (!this.message.tag) {
            this.message.tag = 'feedback';
        } else if (!this.message.tag.toLowerCase().includes('feedback')) {
            this.message.tag = `feedback_${this.message.tag}`;
        }
    }

}
