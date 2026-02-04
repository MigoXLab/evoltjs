/**
 * Abstract Environment class for Reflexion evaluation
 *
 * This is a NEW concept in 0.2.x, different from the old BaseEnvironment
 * (which has been renamed to BaseOrchestrator).
 *
 * The Environment is used by ReflexionOrchestrator to:
 * 1. Evaluate implementations against test cases
 * 2. Provide feedback on whether tests pass or fail
 * 3. Support iterative improvement cycles
 *
 * Corresponds to Python's runtime/environment/base.py
 */

import * as fs from 'fs';
import * as path from 'path';
import { Feedback } from '../../schemas/feedback';

/**
 * Environment options
 */
export interface EnvironmentOptions {
    /**
     * Path to the initial implementation file
     */
    initImpl: string;

    /**
     * Path to the improved implementation file
     * Must be different from initImpl
     */
    improvedImpl: string;

    /**
     * Arguments passed to step() for initial implementation
     */
    initStepArgs?: Record<string, any>;

    /**
     * Arguments passed to step() for improved implementation
     */
    improvedStepArgs?: Record<string, any>;
}

/**
 * Abstract Environment class for Reflexion evaluation
 *
 * Subclasses should implement:
 * - step(): Execute and evaluate implementation, returning Feedback
 */
export abstract class Environment {
    /**
     * Arguments for the step method (initial implementation)
     */
    initStepArgs: Record<string, any> = {};

    /**
     * Arguments for the step method (improved implementation)
     */
    improvedStepArgs: Record<string, any> = {};

    /**
     * Path to the initial implementation file
     */
    initImpl: string;

    /**
     * Path to the improved implementation file
     */
    improvedImpl: string;

    constructor(options: EnvironmentOptions) {
        this.initImpl = path.resolve(options.initImpl);
        this.improvedImpl = path.resolve(options.improvedImpl);
        this.initStepArgs = options.initStepArgs || {};
        this.improvedStepArgs = options.improvedStepArgs || {};

        // Initialize the improved implementation by copying from init
        this._initImprovedImpl();
    }

    /**
     * Initialize the improved implementation by copying from init
     */
    private _initImprovedImpl(): void {
        if (fs.existsSync(this.initImpl)) {
            // Remove existing improved implementation if it exists
            if (fs.existsSync(this.improvedImpl)) {
                const stats = fs.statSync(this.improvedImpl);
                if (stats.isDirectory()) {
                    fs.rmSync(this.improvedImpl, { recursive: true });
                } else {
                    fs.unlinkSync(this.improvedImpl);
                }
            }

            // Copy init to improved
            fs.copyFileSync(this.initImpl, this.improvedImpl);
        }
    }

    /**
     * Execute and evaluate the implementation
     *
     * This method should:
     * 1. Run the implementation (or tests against it)
     * 2. Determine if it passes or fails
     * 3. Return a Feedback object with results
     *
     * @param args - Additional arguments
     * @returns Feedback with isPassing status and feedback message
     */
    abstract step(...args: any[]): Promise<Feedback>;
}
