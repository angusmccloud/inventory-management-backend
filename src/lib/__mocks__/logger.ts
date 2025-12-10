/**
 * Manual mock for logger module
 */

export const logger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

export const createLambdaLogger = jest.fn(() => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

export const logLambdaInvocation = jest.fn();
export const logLambdaCompletion = jest.fn();

