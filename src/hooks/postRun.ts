/**
 * Post-run hooks for agent output processing
 *
 * PostProcessor allows transformation of agent output from raw string response
 * to structured data (e.g., JSON parsing, data validation, formatting)
 */

/**
 * PostProcessor function type
 *
 * Takes the raw string response from an agent and transforms it into
 * any desired format. Commonly used for:
 * - Parsing JSON responses
 * - Extracting structured data
 * - Validating and transforming output
 * - Converting to domain-specific types
 *
 * @param response - Raw string response from agent
 * @returns Transformed output (any type)
 *
 * @example
 * ```typescript
 * // JSON parser post-processor
 * const jsonParser: PostProcessor = async (text) => {
 *   const match = text.match(/```json\n([\s\S]+?)\n```/);
 *   return match ? JSON.parse(match[1]) : JSON.parse(text);
 * };
 *
 * const agent = new Agent({
 *   name: "DataAgent",
 *   post_processor: jsonParser
 * });
 *
 * const data = await agent.run("Generate user data");
 * // Returns: { name: "John", age: 30 }
 * ```
 */
export type PostProcessor = (response: string) => Promise<any>;
