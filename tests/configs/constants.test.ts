/**
 * Tests for constants module
 */

import { 
  DEFAULT_CONFIG, 
  TOOL_CONSTANTS, 
  MESSAGE_ROLES, 
  TOOL_CALL_TYPES,
  ENV_VARS,
  ERROR_MESSAGES,
  LOG_LEVELS 
} from '../../src/configs/constants';

describe('constants', () => {
  describe('DEFAULT_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_CONFIG.MODEL).toBe('deepseek');
      expect(DEFAULT_CONFIG.PROVIDER).toBe('deepseek');
      expect(DEFAULT_CONFIG.CONTEXT_WINDOW).toBe(32768);
      expect(DEFAULT_CONFIG.MAX_OUTPUT_TOKENS).toBe(4096);
      expect(DEFAULT_CONFIG.TEMPERATURE).toBe(0.7);
      expect(DEFAULT_CONFIG.TOP_P).toBe(0.9);
    });
  });

  describe('TOOL_CONSTANTS', () => {
    it('should have correct tool prefixes', () => {
      expect(TOOL_CONSTANTS.SYSTEM_TOOL_PREFIX).toBe('SystemTool.');
      expect(TOOL_CONSTANTS.USER_TOOL_PREFIX).toBe('UserTool.');
      expect(TOOL_CONSTANTS.AGENT_TOOL_PREFIX).toBe('Agent.');
      expect(TOOL_CONSTANTS.MCP_TOOL_PREFIX).toBe('MCP.');
    });
  });

  describe('MESSAGE_ROLES', () => {
    it('should have correct message roles', () => {
      expect(MESSAGE_ROLES.SYSTEM).toBe('system');
      expect(MESSAGE_ROLES.USER).toBe('user');
      expect(MESSAGE_ROLES.ASSISTANT).toBe('assistant');
    });
  });

  describe('TOOL_CALL_TYPES', () => {
    it('should have correct tool call types', () => {
      expect(TOOL_CALL_TYPES.SYSTEM).toBe('system');
      expect(TOOL_CALL_TYPES.USER).toBe('user');
    });
  });

  describe('ENV_VARS', () => {
    it('should have correct environment variable names', () => {
      expect(ENV_VARS.EVOLT_CONFIG_PATH).toBe('EVOLT_CONFIG_PATH');
      expect(ENV_VARS.DEEPSEEK_API_KEY).toBe('DEEPSEEK_API_KEY');
      expect(ENV_VARS.DEEPSEEK_BASE_URL).toBe('DEEPSEEK_BASE_URL');
      expect(ENV_VARS.OPENAI_API_KEY).toBe('OPENAI_API_KEY');
      expect(ENV_VARS.ANTHROPIC_API_KEY).toBe('ANTHROPIC_API_KEY');
    });
  });

  describe('ERROR_MESSAGES', () => {
    it('should have correct error messages', () => {
      expect(ERROR_MESSAGES.CONFIG_LOAD_FAILED).toBe('Failed to load configuration');
      expect(ERROR_MESSAGES.MODEL_NOT_FOUND).toBe('Model configuration not found');
      expect(ERROR_MESSAGES.TOOL_NOT_REGISTERED).toBe('Tool not registered in tool store');
      expect(ERROR_MESSAGES.INVALID_MESSAGE_FORMAT).toBe('Invalid message format');
      expect(ERROR_MESSAGES.TOOL_EXECUTION_FAILED).toBe('Tool execution failed');
    });
  });

  describe('LOG_LEVELS', () => {
    it('should have correct log level values', () => {
      expect(LOG_LEVELS.DEBUG).toBe(0);
      expect(LOG_LEVELS.INFO).toBe(1);
      expect(LOG_LEVELS.WARNING).toBe(2);
      expect(LOG_LEVELS.ERROR).toBe(3);
    });
  });
});