/**
 * Tests for settings module
 */

import { 
  DEFAULT_SETTINGS, 
  settings, 
  initializeSettings, 
  getSettings, 
  updateSettings 
} from '../../src/configs/settings';
import { LOG_LEVELS } from '../../src/configs/constants';

describe('settings', () => {
  // Save original environment variables
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment variables and settings
    process.env = { ...originalEnv };
    settings.reset();
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
    settings.reset();
  });

  describe('DEFAULT_SETTINGS', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_SETTINGS.logLevel).toBe(LOG_LEVELS.INFO);
      expect(DEFAULT_SETTINGS.verbose).toBe(false);
      expect(DEFAULT_SETTINGS.debug).toBe(false);
      expect(DEFAULT_SETTINGS.workspace).toBe('./workspace');
      expect(DEFAULT_SETTINGS.maxRetries).toBe(3);
      expect(DEFAULT_SETTINGS.timeout).toBe(30000);
      expect(DEFAULT_SETTINGS.enableCache).toBe(true);
      expect(DEFAULT_SETTINGS.enableTelemetry).toBe(false);
    });
  });

  describe('SettingsManager', () => {
    it('should initialize with default settings', () => {
      const currentSettings = settings.get();
      expect(currentSettings).toEqual(DEFAULT_SETTINGS);
    });

    it('should update settings correctly', () => {
      const newSettings = {
        verbose: true,
        maxRetries: 5,
        timeout: 60000
      };

      settings.update(newSettings);
      const currentSettings = settings.get();

      expect(currentSettings.verbose).toBe(true);
      expect(currentSettings.maxRetries).toBe(5);
      expect(currentSettings.timeout).toBe(60000);
      // Other settings should remain unchanged
      expect(currentSettings.logLevel).toBe(DEFAULT_SETTINGS.logLevel);
      expect(currentSettings.enableCache).toBe(DEFAULT_SETTINGS.enableCache);
    });

    it('should get specific setting values', () => {
      expect(settings.getValue('verbose')).toBe(false);
      expect(settings.getValue('maxRetries')).toBe(3);
      expect(settings.getValue('timeout')).toBe(30000);
    });

    it('should set specific setting values', () => {
      settings.setValue('verbose', true);
      settings.setValue('maxRetries', 10);

      expect(settings.getValue('verbose')).toBe(true);
      expect(settings.getValue('maxRetries')).toBe(10);
    });

    it('should reset to default settings', () => {
      // Modify settings
      settings.update({
        verbose: true,
        maxRetries: 10,
        debug: true
      });

      // Reset
      settings.reset();

      const currentSettings = settings.get();
      expect(currentSettings).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe('initializeSettings', () => {
    it('should initialize settings from environment variables', () => {
      process.env.EVOLT_LOG_LEVEL = 'debug';
      process.env.EVOLT_VERBOSE = 'true';
      process.env.EVOLT_WORKSPACE = '/custom/workspace';
      process.env.EVOLT_MAX_RETRIES = '5';
      process.env.EVOLT_TIMEOUT = '60000';
      process.env.EVOLT_ENABLE_CACHE = 'false';

      initializeSettings();

      const currentSettings = settings.get();
      expect(currentSettings.logLevel).toBe(LOG_LEVELS.DEBUG);
      expect(currentSettings.verbose).toBe(true);
      expect(currentSettings.workspace).toBe('/custom/workspace');
      expect(currentSettings.maxRetries).toBe(5);
      expect(currentSettings.timeout).toBe(60000);
      expect(currentSettings.enableCache).toBe(false);
    });

    it('should set debug mode and log level when EVOLT_DEBUG is true', () => {
      process.env.EVOLT_DEBUG = 'true';

      initializeSettings();

      const currentSettings = settings.get();
      expect(currentSettings.debug).toBe(true);
      expect(currentSettings.logLevel).toBe(LOG_LEVELS.DEBUG);
    });

    it('should handle invalid numeric environment variables gracefully', () => {
      process.env.EVOLT_MAX_RETRIES = 'invalid';
      process.env.EVOLT_TIMEOUT = 'not-a-number';

      initializeSettings();

      const currentSettings = settings.get();
      // Should keep default values
      expect(currentSettings.maxRetries).toBe(DEFAULT_SETTINGS.maxRetries);
      expect(currentSettings.timeout).toBe(DEFAULT_SETTINGS.timeout);
    });
  });

  describe('convenience functions', () => {
    it('getSettings should return current settings', () => {
      const currentSettings = getSettings();
      expect(currentSettings).toEqual(settings.get());
    });

    it('updateSettings should update settings', () => {
      const newSettings = {
        verbose: true,
        maxRetries: 8
      };

      updateSettings(newSettings);

      const currentSettings = getSettings();
      expect(currentSettings.verbose).toBe(true);
      expect(currentSettings.maxRetries).toBe(8);
    });
  });
});