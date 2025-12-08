/**
 * Structured Logging Utility - Family Inventory Management System
 * 
 * Provides structured JSON logging for CloudWatch with proper
 * log levels, context, and error handling.
 */

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Log entry structure
 */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  requestId?: string;
  familyId?: string;
  memberId?: string;
}

/**
 * Get the current log level from environment variable
 */
const getLogLevel = (): LogLevel => {
  const level = process.env['LOG_LEVEL']?.toUpperCase() || 'INFO';
  return LogLevel[level as keyof typeof LogLevel] || LogLevel.INFO;
};

/**
 * Check if a log level should be logged based on current configuration
 */
const shouldLog = (level: LogLevel): boolean => {
  const configuredLevel = getLogLevel();
  const levels = Object.values(LogLevel);
  
  return levels.indexOf(level) >= levels.indexOf(configuredLevel);
};

/**
 * Format and output a log entry
 */
const writeLog = (entry: LogEntry): void => {
  if (!shouldLog(entry.level)) {
    return;
  }
  
  const logOutput = JSON.stringify(entry);
  
  // Use console methods for proper CloudWatch integration
  switch (entry.level) {
    case LogLevel.ERROR:
      console.error(logOutput);
      break;
    case LogLevel.WARN:
      console.warn(logOutput);
      break;
    case LogLevel.DEBUG:
      console.debug(logOutput);
      break;
    case LogLevel.INFO:
    default:
      console.log(logOutput);
      break;
  }
};

/**
 * Logger class with context
 */
export class Logger {
  private context: Record<string, unknown>;
  
  constructor(context: Record<string, unknown> = {}) {
    this.context = context;
  }
  
  /**
   * Create a child logger with additional context
   */
  child(additionalContext: Record<string, unknown>): Logger {
    return new Logger({ ...this.context, ...additionalContext });
  }
  
  /**
   * Set context for all subsequent logs
   */
  setContext(context: Record<string, unknown>): void {
    this.context = { ...this.context, ...context };
  }
  
  /**
   * Log a debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    writeLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.DEBUG,
      message,
      context: { ...this.context, ...context },
    });
  }
  
  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    writeLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      message,
      context: { ...this.context, ...context },
    });
  }
  
  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    writeLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.WARN,
      message,
      context: { ...this.context, ...context },
    });
  }
  
  /**
   * Log an error message
   */
  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    writeLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.ERROR,
      message,
      context: { ...this.context, ...context },
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    });
  }
}

/**
 * Default logger instance
 */
export const logger = new Logger();

/**
 * Create a logger with Lambda context
 */
export const createLambdaLogger = (awsRequestId?: string): Logger => {
  return new Logger({
    requestId: awsRequestId,
    service: 'inventory-management',
  });
};

/**
 * Log Lambda function invocation
 */
export const logLambdaInvocation = (
  functionName: string,
  event: unknown,
  requestId?: string
): void => {
  const logger = createLambdaLogger(requestId);
  logger.info('Lambda invocation started', {
    functionName,
    eventType: typeof event,
  });
};

/**
 * Log Lambda function completion
 */
export const logLambdaCompletion = (
  functionName: string,
  duration: number,
  requestId?: string
): void => {
  const logger = createLambdaLogger(requestId);
  logger.info('Lambda invocation completed', {
    functionName,
    durationMs: duration,
  });
};

/**
 * Log Lambda function error
 */
export const logLambdaError = (
  functionName: string,
  error: Error,
  requestId?: string
): void => {
  const logger = createLambdaLogger(requestId);
  logger.error(`Lambda invocation failed: ${functionName}`, error);
};
