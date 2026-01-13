/**
 * Winston logger configuration
 *
 * Provides a centralized logging solution to replace console calls
 * Format inspired by loguru for better readability
 */

import * as winston from 'winston';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const getDisableLog = (): boolean => {
    return process.env.DISABLE_LOG == 'true' || !('DISABLE_LOG' in process.env);
};

// Winston log levels (npm standard)
// winston levels: error: 0, warn: 1, info: 2, http: 3, verbose: 4, debug: 5, silly: 6
const winstonLevels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    verbose: 4,
    debug: 5,
    silly: 6,
};

// Get log level from environment variable
const getLogLevel = (): string => {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase() || 'error';
    // Map some common level names to winston levels
    const levelMapping: Record<string, string> = {
        fatal: 'error',
        trace: 'debug',
    };
    return levelMapping[envLevel] || envLevel;
};

// No longer need addCallerInfo format since we're capturing it in the wrapper

/**
 * Custom winston format for loguru-style output
 * Format: YYYY-MM-DD HH:MM:SS | LEVEL | file:line | MESSAGE
 */
const loguruFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }: any) => {
        const formattedLevel = level.toUpperCase().padEnd(7);
        const caller = meta.caller || meta[0]?.caller;
        const location = caller ? `${String(caller).padEnd(35)} | ` : '';
        const msg = stack || message;
        return `${timestamp} | ${formattedLevel} | ${location}${msg}`;
    })
);

/**
 * Custom winston format with colors for console output
 */
const loguruFormatColored = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }: any) => {
        // Convert level to uppercase and pad it
        const levelUpper = level.toUpperCase().padEnd(7);

        // Apply colors manually
        let coloredLevel = levelUpper;
        if (level === 'error') {
            coloredLevel = `\u001b[31m${levelUpper}\u001b[39m`; // red
        } else if (level === 'warn') {
            coloredLevel = `\u001b[33m${levelUpper}\u001b[39m`; // yellow
        } else if (level === 'info') {
            coloredLevel = `\u001b[36m${levelUpper}\u001b[39m`; // cyan
        } else if (level === 'debug') {
            coloredLevel = `\u001b[34m${levelUpper}\u001b[39m`; // blue
        }

        // Add caller info (file:line) with color
        const caller = meta.caller || meta[0]?.caller;
        const location = caller ? `\u001b[90m${String(caller).padEnd(35)}\u001b[39m | ` : '';

        const msg = stack || message;
        return `${timestamp} | ${coloredLevel} | ${location}${msg}`;
    })
);

/**
 * Create winston transports based on LOG_OUTPUT environment variable
 * LOG_OUTPUT can be:
 * - undefined/empty: use console (default, error->stderr, others->stdout)
 * - 'console': use console (same as default)
 * - 'stdout': use process.stdout (all logs)
 * - 'stderr': use process.stderr (all logs)
 * - file path: write to both console and file
 *
 * When ENABLE_LOG is 'false', no transports will be created (logging disabled)
 */
const createLoggerTransports = (): winston.transport[] => {
    // Check if logging is disabled
    if (getDisableLog()) {
        return [];
    }

    const output = process.env.LOG_OUTPUT;

    if (!output || output === 'console') {
        // Default: use separate transports for error and other levels
        return [
            new winston.transports.Console({
                level: getLogLevel(),
                format: loguruFormatColored,
                stderrLevels: ['error'], // Only error goes to stderr
            }),
        ];
    } else if (output === 'stdout') {
        return [
            new winston.transports.Stream({
                stream: process.stdout,
                format: loguruFormat,
            }),
        ];
    } else if (output === 'stderr') {
        return [
            new winston.transports.Stream({
                stream: process.stderr,
                format: loguruFormat,
            }),
        ];
    } else {
        // File output: output to both console and file
        return [
            new winston.transports.Console({
                level: getLogLevel(),
                format: loguruFormatColored,
                stderrLevels: ['error'], // Only error goes to stderr
            }),
            new winston.transports.File({
                filename: output,
                format: loguruFormat,
            }),
        ];
    }
};

// Create winston logger
const logger = winston.createLogger({
    levels: winstonLevels,
    level: getLogLevel(),
    transports: createLoggerTransports(),
});

// Add custom colors for winston
winston.addColors({
    error: 'red',
    warn: 'yellow',
    info: 'cyan',
    http: 'green',
    verbose: 'blue',
    debug: 'blue',
    silly: 'magenta',
});

/**
 * Capture caller info immediately and pass to logger
 */
function captureCallerInfo(): string {
    const stack = new Error().stack;
    if (!stack) return '';

    const lines = stack.split('\n');
    // Skip first 3 lines: Error, captureCallerInfo, and the logger method wrapper
    for (let i = 3; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/\(([^)]+):(\d+):\d+\)/) || line.match(/at\s+([^()\s]+):(\d+):\d+/);

        if (match && match[1]) {
            const fullPath = match[1];
            const lineNum = match[2];

            // Skip internal files
            if (fullPath.includes('node_modules') || fullPath.endsWith('logger.ts') || fullPath.endsWith('logger.js')) {
                continue;
            }

            const workspaceRoot = process.cwd();
            let displayPath = fullPath;

            if (fullPath.startsWith(workspaceRoot)) {
                displayPath = fullPath.substring(workspaceRoot.length + 1);
            } else {
                const parts = fullPath.split(/[/\\]/);
                displayPath = parts[parts.length - 1];
            }

            return `${displayPath}:${lineNum}`;
        }
    }

    return '';
}

// dummy logger
const dummyLogger = {
    error: () => {},
    warn: () => {},
    info: () => {},
    debug: () => {},
    http: () => {},
    verbose: () => {},
    silly: () => {},
};

/**
 * Enhanced logger with caller info
 */
const enhancedLogger = {
    error: (message?: any, ...meta: any[]) => {
        const caller = captureCallerInfo();
        logger.error(message, { ...meta, caller });
    },
    warn: (message?: any, ...meta: any[]) => {
        const caller = captureCallerInfo();
        logger.warn(message, { ...meta, caller });
    },
    info: (message?: any, ...meta: any[]) => {
        const caller = captureCallerInfo();
        logger.info(message, { ...meta, caller });
    },
    debug: (message?: any, ...meta: any[]) => {
        const caller = captureCallerInfo();
        logger.debug(message, { ...meta, caller });
    },
    http: (message?: any, ...meta: any[]) => {
        const caller = captureCallerInfo();
        logger.http(message, { ...meta, caller });
    },
    verbose: (message?: any, ...meta: any[]) => {
        const caller = captureCallerInfo();
        logger.verbose(message, { ...meta, caller });
    },
    silly: (message?: any, ...meta: any[]) => {
        const caller = captureCallerInfo();
        logger.silly(message, { ...meta, caller });
    },
};

/**
 * Stream logger for streaming output
 * Provides direct write access to stdout without formatting
 * Suitable for streaming scenarios where content should be output as-is
 */
const streamLogger = {
    /**
     * Write content directly to stdout without formatting
     * Used for streaming output where content comes in chunks
     */
    info: (message: string) => {
        if (!getDisableLog()) {
            process.stdout.write(message);
            if (process.env.LOG_OUTPUT) {
                fs.appendFileSync(process.env.LOG_OUTPUT, message);
            }
        }
    },
    /**
     * Write error content to stderr
     */
    error: (message: string) => {
        if (!getDisableLog()) {
            process.stderr.write(message);
            if (process.env.LOG_OUTPUT) {
                fs.appendFileSync(process.env.LOG_OUTPUT, message);
            }
        }
    },
    /**
     * Write content with newline
     */
    log: (message: string) => {
        if (!getDisableLog()) {
            process.stdout.write(message + '\n');
            if (process.env.LOG_OUTPUT) {
                fs.appendFileSync(process.env.LOG_OUTPUT, message + '\n');
            }
        }
    },
    debug: (message: string) => {
        if (!getDisableLog()) {
            process.stdout.write(message);
            if (process.env.LOG_OUTPUT) {
                fs.appendFileSync(process.env.LOG_OUTPUT, message);
            }
        }
    },
};

export default { enhancedLogger, dummyLogger, streamLogger, getDisableLog };
