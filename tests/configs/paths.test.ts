/**
 * Tests for paths module
 */

import * as path from 'path';
import * as fs from 'fs';
import { 
  getWorkspaceDir, 
  getConfigDir, 
  getLogsDir, 
  getCacheDir,
  ensureDir,
  getWorkspacePath,
  getConfigPath,
  isInWorkspace,
  normalizePath,
  getFileExtension,
  fileExists,
  getTempFilePath
} from '../../src/configs/paths';

describe('paths', () => {
  // Save original environment variables
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment variables
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('getWorkspaceDir', () => {
    it('should return default workspace directory', () => {
      delete process.env.EVOLT_WORKSPACE;
      const workspaceDir = getWorkspaceDir();
      expect(workspaceDir).toBe(path.join(process.cwd(), 'workspace'));
    });

    it('should return custom workspace directory from environment', () => {
      process.env.EVOLT_WORKSPACE = '/custom/workspace';
      const workspaceDir = getWorkspaceDir();
      expect(workspaceDir).toBe('/custom/workspace');
    });
  });

  describe('getConfigDir', () => {
    it('should return default config directory', () => {
      delete process.env.EVOLT_CONFIG_DIR;
      const configDir = getConfigDir();
      expect(configDir).toBe(path.join(process.cwd(), 'config'));
    });

    it('should return custom config directory from environment', () => {
      process.env.EVOLT_CONFIG_DIR = '/custom/config';
      const configDir = getConfigDir();
      expect(configDir).toBe('/custom/config');
    });
  });

  describe('getLogsDir', () => {
    it('should return logs directory within workspace', () => {
      const logsDir = getLogsDir();
      expect(logsDir).toBe(path.join(getWorkspaceDir(), 'logs'));
    });

    it('should return custom logs directory from environment', () => {
      process.env.EVOLT_LOGS_DIR = '/custom/logs';
      const logsDir = getLogsDir();
      expect(logsDir).toBe('/custom/logs');
    });
  });

  describe('getCacheDir', () => {
    it('should return cache directory within workspace', () => {
      const cacheDir = getCacheDir();
      expect(cacheDir).toBe(path.join(getWorkspaceDir(), 'cache'));
    });

    it('should return custom cache directory from environment', () => {
      process.env.EVOLT_CACHE_DIR = '/custom/cache';
      const cacheDir = getCacheDir();
      expect(cacheDir).toBe('/custom/cache');
    });
  });

  describe('ensureDir', () => {
    it('should create directory if it does not exist', () => {
      const testDir = path.join(__dirname, 'test-dir');
      
      // Ensure directory doesn't exist
      if (fs.existsSync(testDir)) {
        fs.rmdirSync(testDir);
      }
      
      ensureDir(testDir);
      expect(fs.existsSync(testDir)).toBe(true);
      
      // Cleanup
      fs.rmdirSync(testDir);
    });

    it('should not throw if directory already exists', () => {
      const testDir = path.join(__dirname, 'test-dir');
      
      // Create directory first
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir);
      }
      
      expect(() => ensureDir(testDir)).not.toThrow();
      
      // Cleanup
      fs.rmdirSync(testDir);
    });
  });

  describe('getWorkspacePath', () => {
    it('should return absolute path relative to workspace', () => {
      const relativePath = 'test/file.txt';
      const expectedPath = path.join(getWorkspaceDir(), relativePath);
      const resultPath = getWorkspacePath(relativePath);
      expect(resultPath).toBe(expectedPath);
    });
  });

  describe('getConfigPath', () => {
    it('should return absolute path relative to config directory', () => {
      const relativePath = 'test/config.yaml';
      const expectedPath = path.join(getConfigDir(), relativePath);
      const resultPath = getConfigPath(relativePath);
      expect(resultPath).toBe(expectedPath);
    });
  });

  describe('isInWorkspace', () => {
    it('should return true for paths within workspace', () => {
      const workspacePath = getWorkspacePath('test/file.txt');
      expect(isInWorkspace(workspacePath)).toBe(true);
    });

    it('should return false for paths outside workspace', () => {
      const outsidePath = '/outside/path/file.txt';
      expect(isInWorkspace(outsidePath)).toBe(false);
    });
  });

  describe('normalizePath', () => {
    it('should normalize path separators', () => {
      const inputPath = 'path\\to\\file.txt';
      const normalized = normalizePath(inputPath);
      expect(normalized).toBe('path/to/file.txt');
    });
  });

  describe('getFileExtension', () => {
    it('should return file extension in lowercase', () => {
      expect(getFileExtension('file.txt')).toBe('.txt');
      expect(getFileExtension('file.JSON')).toBe('.json');
      expect(getFileExtension('file')).toBe('');
    });
  });

  describe('fileExists', () => {
    it('should return true for existing files', () => {
      const existingFile = __filename; // This test file itself
      expect(fileExists(existingFile)).toBe(true);
    });

    it('should return false for non-existing files', () => {
      const nonExistingFile = path.join(__dirname, 'non-existing-file.txt');
      expect(fileExists(nonExistingFile)).toBe(false);
    });
  });

  describe('getTempFilePath', () => {
    it('should return a temporary file path', () => {
      const tempPath = getTempFilePath('test');
      expect(tempPath).toContain('test');
      expect(tempPath).toContain('.tmp');
      expect(tempPath).toContain(path.join(getCacheDir(), 'temp'));
    });
  });
});