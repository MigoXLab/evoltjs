/**
 * Utils module exports
 */

export { AsyncExitStack } from './connections';
export { hasToolcall, isWriteJsonFile, convertStrToObject, extractToolcallsFromStr, executeSingleTool, executeTools } from './toolUtil';
export { MessageCost } from './cost';
export { deprecated, DeprecatedOptions } from './deprecated';
export { isSupportedImageFile, readImage, areadImage, ImageContent } from './readImage';
import loggers from './logger';

export const logger = loggers.getDisableLog() ? loggers.dummyLogger : loggers.enhancedLogger;
// streamLogger already handles getDisableLog() internally in createStreamLogger
export const streamLogger = loggers.getDisableLog() ? loggers.dummyLogger : loggers.streamLogger;

if (process.env.LOG_LEVEL) {
    logger.info(`LOG_LEVEL: ${process.env.LOG_LEVEL}`);
} else {
    logger.info('LOG_LEVEL is not set');
}

if (process.env.LOG_OUTPUT) {
    logger.info(`LOG_OUTPUT: ${process.env.LOG_OUTPUT}`);
}

if (process.env.ENABLE_LOG === 'true') {
    logger.info('ENABLE_LOG is set to true');
} else {
    logger.info('ENABLE_LOG is not set');
}
