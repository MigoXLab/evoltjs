/**
 * Tests for configLoader module
 */

import { loadModelConfig, convertTypeNameToOpenai } from '../../src/configs/configLoader';
import { ModelConfig } from '../../src/types';

describe('configLoader', () => {
  describe('loadModelConfig', () => {
    it('should return default configuration when no model name is provided', () => {
      const config = loadModelConfig();

      expect(config).toBeDefined();
      expect(config.provider).toBe('deepseek');
      expect(config.model).toBe('deepseek-chat');
      expect(config.contextWindowTokens).toBe(32768);
      expect(config.maxOutputTokens).toBe(4096);
      expect(config.temperature).toBe(0.7);
      expect(config.topP).toBe(0.9);
    });

    it('should return configuration for specified model', () => {
      const config = loadModelConfig('openai');

      expect(config).toBeDefined();
      expect(config.provider).toBe('openai');
      expect(config.model).toBe('gpt-3.5-turbo');
    });

    it('should handle missing model gracefully', () => {
      const config = loadModelConfig('nonexistent-model');

      // Should fall back to default model config
      expect(config).toBeDefined();
      expect(config.provider).toBe('deepseek');
    });
  });

  describe('convertTypeNameToOpenai', () => {
    it('should convert Python type names to OpenAI format', () => {
      expect(convertTypeNameToOpenai('str')).toBe('string');
      expect(convertTypeNameToOpenai('string')).toBe('string');
      expect(convertTypeNameToOpenai('int')).toBe('integer');
      expect(convertTypeNameToOpenai('integer')).toBe('integer');
      expect(convertTypeNameToOpenai('float')).toBe('number');
      expect(convertTypeNameToOpenai('number')).toBe('number');
      expect(convertTypeNameToOpenai('bool')).toBe('boolean');
      expect(convertTypeNameToOpenai('boolean')).toBe('boolean');
      expect(convertTypeNameToOpenai('list')).toBe('array');
      expect(convertTypeNameToOpenai('array')).toBe('array');
      expect(convertTypeNameToOpenai('dict')).toBe('object');
      expect(convertTypeNameToOpenai('object')).toBe('object');
    });

    it('should return string for unknown types', () => {
      expect(convertTypeNameToOpenai('unknown')).toBe('string');
      expect(convertTypeNameToOpenai('custom')).toBe('string');
    });
  });
});