/**
 * Coding orchestrator for multi-agent management
 *
 * Renamed from CodingEnvironment to CodingOrchestrator in 0.2.x
 * Converts Python's runtime/orchestrator/coding.py to TypeScript
 */

import { BaseOrchestrator } from './base';

/**
 * Orchestrator for coding tasks
 *
 * Renamed from CodingEnvironment in Python 0.2.x.
 * Kept for backward compatibility. In Python 0.2.x this is just a pass-through subclass.
 */
export class CodingOrchestrator extends BaseOrchestrator {}

/**
 * @deprecated Use CodingOrchestrator instead. This alias is kept for backward compatibility.
 */
export const CodingEnvironment = CodingOrchestrator;
