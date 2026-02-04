interface DeprecatedOptions {
    version?: string;
    reason?: string;
    replacement?: string;
}

/**
 * Decorator to mark a method as deprecated.
 * Logs a warning when the method is called.
 *
 * @param options - Configuration options
 * @param options.version - Version in which the method will be removed
 * @param options.replacement - Suggested replacement method
 *
 * @example
 * ```typescript
 * class MyClass {
 *   @markDeprecated({ version: '0.2.2', replacement: 'formatForApi' })
 *   oldMethod() {
 *     // ...
 *   }
 * }
 * ```
 */
export function markDeprecated(options: DeprecatedOptions = {}) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const original = descriptor.value;

        descriptor.value = function (...args: any[]) {
            const parts: string[] = [`${propertyKey} is deprecated`];

            if (options.version) {
                parts.push(`will be removed in ${options.version}`);
            }

            if (options.replacement) {
                parts.push(`use ${options.replacement} instead`);
            }

            if (options.reason) {
                parts.push(`reason: ${options.reason}`);
            }

            console.warn(parts.join(', '));

            return original.apply(this, args);
        };

        return descriptor;
    };
}
