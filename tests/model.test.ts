/**
 * Tests for model module
 */

import { Model } from '../src/model';
import { ModelConfig } from '../src/types';

describe('Model', () => {
  describe('constructor', () => {
    it('should initialize with default model', () => {
      const model = new Model();
      expect(model.getName()).toBe('deepseek');
    });

    it('should initialize with specified model', () => {
      const model = new Model('openai');
      expect(model.getName()).toBe('openai');
    });

    it('should load configuration', () => {
      const model = new Model();
      const config = model.getConfig();

      expect(config).toBeDefined();
      expect(config.provider).toBe('deepseek');
      expect(config.model).toBe('deepseek-chat');
      expect(config.contextWindowTokens).toBe(32768);
    });
  });

  describe('achat', () => {
    it('should call OpenAI provider', async () => {
      const model = new Model('openai');
      const messages = [{ role: 'user', content: 'Hello' }];
      
      const response = await model.achat(messages);
      
      expect(response).toBeDefined();
      expect(response).toHaveLength(1);
      expect(response[0].type).toBe('system');
      expect(typeof response[0].extractedResult()).toBe('string');
    });

    it('should call Anthropic provider', async () => {
      const model = new Model('anthropic');
      const messages = [{ role: 'user', content: 'Hello' }];
      
      const response = await model.achat(messages);
      
      expect(response).toBeDefined();
      expect(response).toHaveLength(1);
      expect(response[0].type).toBe('system');
    });

    it('should call DeepSeek provider', async () => {
      const model = new Model();
      const messages = [{ role: 'user', content: 'Hello' }];
      
      const response = await model.achat(messages);
      
      expect(response).toBeDefined();
      expect(response).toHaveLength(1);
      expect(response[0].type).toBe('system');
    });

    it('should handle tools parameter', async () => {
      const model = new Model('openai');
      const messages = [{ role: 'user', content: 'Hello' }];
      const tools = [{ type: 'function', function: { name: 'test', parameters: {} } }];
      
      const response = await model.achat(messages, tools);
      
      expect(response).toBeDefined();
    });

    it('should throw error for unsupported provider', async () => {
      // Mock loadModelConfig to return unsupported provider
      const originalLoadModelConfig = require('../src/configs/configLoader').loadModelConfig;
      require('../src/configs/configLoader').loadModelConfig = () => ({
        provider: 'unsupported',
        model: 'test-model',
        context_window_tokens: 4096,
        max_output_tokens: 1024,
        temperature: 0.7,
        top_p: 0.9
      });

      const model = new Model();
      
      await expect(model.achat([{ role: 'user', content: 'Hello' }]))
        .rejects.toThrow('Unsupported provider: unsupported');

      // Restore original function
      require('../src/configs/configLoader').loadModelConfig = originalLoadModelConfig;
    });
  });

  describe('supportsToolCalling', () => {
    it('should return true for supported models', () => {
      const supportedModels = [
        'gpt-3.5-turbo',
        'gpt-4',
        'claude-3-sonnet-20240229',
        'deepseek-chat'
      ];

      for (const modelName of supportedModels) {
        const originalLoadModelConfig = require('../src/configs/configLoader').loadModelConfig;
        require('../src/configs/configLoader').loadModelConfig = () => ({
          provider: 'test',
          model: modelName,
          context_window_tokens: 4096,
          max_output_tokens: 1024,
          temperature: 0.7,
          top_p: 0.9
        });

        const model = new Model();
        expect(model.supportsToolCalling()).toBe(true);

        // Restore original function
        require('../src/configs/configLoader').loadModelConfig = originalLoadModelConfig;
      }
    });

    it('should return false for unsupported models', () => {
      const originalLoadModelConfig = require('../src/configs/configLoader').loadModelConfig;
      require('../src/configs/configLoader').loadModelConfig = () => ({
        provider: 'test',
        model: 'unsupported-model',
        context_window_tokens: 4096,
        max_output_tokens: 1024,
        temperature: 0.7,
        top_p: 0.9
      });

      const model = new Model();
      expect(model.supportsToolCalling()).toBe(false);

      // Restore original function
      require('../src/configs/configLoader').loadModelConfig = originalLoadModelConfig;
    });
  });
});