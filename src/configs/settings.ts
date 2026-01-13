/**
 * Application settings and runtime configuration
 *
 * Converts Python's settings.py to TypeScript
 */

import { LOG_LEVELS } from './constants';

/**
 * Application settings interface
 */
export interface AppSettings {
    logLevel: number;
    verbose: boolean;
    debug: boolean;
    workspace: string;
    maxRetries: number;
    timeout: number;
    enableCache: boolean;
    enableTelemetry: boolean;
}

/**
 * Default application settings
 */
export const DEFAULT_SETTINGS: AppSettings = {
    logLevel: LOG_LEVELS.INFO,
    verbose: false,
    debug: false,
    workspace: process.env.EVOLT_WORKSPACE || './workspace',
    maxRetries: 3,
    timeout: 30000, // 30 seconds
    enableCache: true,
    enableTelemetry: false,
};

/**
 * Global settings instance
 */
class SettingsManager {
    private settings: AppSettings = { ...DEFAULT_SETTINGS };

    /**
     * Update settings
     */
    update(newSettings: Partial<AppSettings>): void {
        this.settings = { ...this.settings, ...newSettings };
    }

    /**
     * Get current settings
     */
    get(): AppSettings {
        return { ...this.settings };
    }

    /**
     * Reset to default settings
     */
    reset(): void {
        this.settings = { ...DEFAULT_SETTINGS };
    }

    /**
     * Get specific setting value
     */
    getValue<K extends keyof AppSettings>(key: K): AppSettings[K] {
        return this.settings[key];
    }

    /**
     * Set specific setting value
     */
    setValue<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
        this.settings[key] = value;
    }
}

// Global settings instance
export const settings = new SettingsManager();

/**
 * Initialize settings from environment variables
 */
export function initializeSettings(): void {
    const envSettings: Partial<AppSettings> = {};

    // Log level from environment
    const logLevelEnv = process.env.EVOLT_LOG_LEVEL;
    if (logLevelEnv) {
        const levelMap: { [key: string]: number } = {
            debug: LOG_LEVELS.DEBUG,
            info: LOG_LEVELS.INFO,
            warning: LOG_LEVELS.WARNING,
            error: LOG_LEVELS.ERROR,
        };
        const normalizedLevel = logLevelEnv.toLowerCase();
        envSettings.logLevel = levelMap[normalizedLevel] ?? LOG_LEVELS.INFO;
    }

    // Verbose mode from environment
    if (process.env.EVOLT_VERBOSE === 'true' || process.env.EVOLT_VERBOSE === '1') {
        envSettings.verbose = true;
    }

    // Debug mode from environment
    if (process.env.EVOLT_DEBUG === 'true' || process.env.EVOLT_DEBUG === '1') {
        envSettings.debug = true;
        envSettings.logLevel = LOG_LEVELS.DEBUG;
    }

    // Workspace from environment
    if (process.env.EVOLT_WORKSPACE) {
        envSettings.workspace = process.env.EVOLT_WORKSPACE;
    }

    // Max retries from environment
    if (process.env.EVOLT_MAX_RETRIES) {
        const maxRetries = parseInt(process.env.EVOLT_MAX_RETRIES, 10);
        if (!isNaN(maxRetries)) {
            envSettings.maxRetries = maxRetries;
        }
    }

    // Timeout from environment
    if (process.env.EVOLT_TIMEOUT) {
        const timeout = parseInt(process.env.EVOLT_TIMEOUT, 10);
        if (!isNaN(timeout)) {
            envSettings.timeout = timeout;
        }
    }

    // Cache from environment
    if (process.env.EVOLT_ENABLE_CACHE === 'false' || process.env.EVOLT_ENABLE_CACHE === '0') {
        envSettings.enableCache = false;
    }

    // Telemetry from environment
    if (process.env.EVOLT_ENABLE_TELEMETRY === 'true' || process.env.EVOLT_ENABLE_TELEMETRY === '1') {
        envSettings.enableTelemetry = true;
    }

    settings.update(envSettings);
}

/**
 * Get current settings (convenience function)
 */
export function getSettings(): AppSettings {
    return settings.get();
}

/**
 * Update settings (convenience function)
 */
export function updateSettings(newSettings: Partial<AppSettings>): void {
    settings.update(newSettings);
}

// Auto-initialize settings on module load
initializeSettings();
