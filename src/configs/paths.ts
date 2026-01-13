/**
 * Path configuration and utilities
 *
 * Converts Python's paths.py to TypeScript
 */

import * as path from 'path';
import * as fs from 'fs';

/**
 * Get workspace directory
 */
export function getWorkspaceDir(): string {
    return process.env.EVOLT_WORKSPACE || path.join(process.cwd(), 'workspace');
}

/**
 * Get configuration directory
 */
export function getConfigDir(): string {
    return process.env.EVOLT_CONFIG_DIR || path.join(process.cwd(), 'config');
}

/**
 * Get logs directory
 */
export function getLogsDir(): string {
    return process.env.EVOLT_LOGS_DIR || path.join(getWorkspaceDir(), 'logs');
}

/**
 * Get cache directory
 */
export function getCacheDir(): string {
    return process.env.EVOLT_CACHE_DIR || path.join(getWorkspaceDir(), 'cache');
}

/**
 * Get skills directory
 */
export function getSkillsDir(): string {
    return process.env.EVOLT_SKILLS_DIR || path.join(getWorkspaceDir(), 'skills');
}

/**
 * Ensure directory exists
 */
export function ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Get absolute path relative to workspace
 */
export function getWorkspacePath(relativePath: string): string {
    const workspaceDir = getWorkspaceDir();
    ensureDir(workspaceDir);
    return path.join(workspaceDir, relativePath);
}

/**
 * Get absolute path relative to config directory
 */
export function getConfigPath(relativePath: string): string {
    const configDir = getConfigDir();
    ensureDir(configDir);
    return path.join(configDir, relativePath);
}

/**
 * Check if path is within workspace
 */
export function isInWorkspace(filePath: string): boolean {
    const workspaceDir = getWorkspaceDir();
    const absolutePath = path.resolve(filePath);
    return absolutePath.startsWith(path.resolve(workspaceDir));
}

/**
 * Normalize path for cross-platform compatibility
 */
export function normalizePath(filePath: string): string {
    return path.normalize(filePath).replace(/\\/g, '/');
}

/**
 * Get file extension
 */
export function getFileExtension(filePath: string): string {
    return path.extname(filePath).toLowerCase();
}

/**
 * Check if file exists
 */
export function fileExists(filePath: string): boolean {
    try {
        return fs.existsSync(filePath);
    } catch {
        return false;
    }
}

/**
 * Create temporary file path
 */
export function getTempFilePath(prefix: string = 'evolt'): string {
    const tempDir = path.join(getCacheDir(), 'temp');
    ensureDir(tempDir);
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return path.join(tempDir, `${prefix}_${timestamp}_${random}.tmp`);
}

// Constants for backward compatibility
export const WORKSPACE_DIR = getWorkspaceDir();
export const SKILLS_DIR = getSkillsDir();
