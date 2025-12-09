/**
 * API Response Helpers - Family Inventory Management System
 * 
 * Standardized response formats for API Gateway Lambda proxy integration.
 * Includes CORS headers, proper status codes, and error formatting.
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { ZodError } from 'zod';
import { logger } from './logger.js';

/**
 * Standard API error response structure
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Standard API success response structure
 */
export interface SuccessResponse<T = unknown> {
  data: T;
  message?: string;
}

/**
 * CORS headers for API responses
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Content-Type': 'application/json',
};

/**
 * Create a standardized API Gateway response
 */
const createResponse = (
  statusCode: number,
  body: unknown,
  additionalHeaders: Record<string, string> = {}
): APIGatewayProxyResult => {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      ...additionalHeaders,
    },
    body: JSON.stringify(body),
  };
};

/**
 * Success response with 200 status
 */
export const successResponse = <T>(
  data: T,
  message?: string
): APIGatewayProxyResult => {
  const body: SuccessResponse<T> = {
    data,
    ...(message && { message }),
  };
  
  return createResponse(200, body);
};

/**
 * Created response with 201 status
 */
export const createdResponse = <T>(
  data: T,
  message?: string
): APIGatewayProxyResult => {
  const body: SuccessResponse<T> = {
    data,
    message: message || 'Resource created successfully',
  };
  
  return createResponse(201, body);
};

/**
 * No content response with 204 status
 */
export const noContentResponse = (): APIGatewayProxyResult => {
  return {
    statusCode: 204,
    headers: corsHeaders,
    body: '',
  };
};

/**
 * Bad request error response with 400 status
 */
export const badRequestResponse = (
  message: string,
  details?: unknown
): APIGatewayProxyResult => {
  const body: ErrorResponse = {
    error: {
      code: 'BAD_REQUEST',
      message,
      details: details,
    },
  };
  
  logger.warn('Bad request', { message, details });
  return createResponse(400, body);
};

/**
 * Unauthorized error response with 401 status
 */
export const unauthorizedResponse = (
  message: string = 'Authentication required'
): APIGatewayProxyResult => {
  const body: ErrorResponse = {
    error: {
      code: 'UNAUTHORIZED',
      message,
    },
  };
  
  return createResponse(401, body);
};

/**
 * Forbidden error response with 403 status
 */
export const forbiddenResponse = (
  message: string = 'Access denied'
): APIGatewayProxyResult => {
  const body: ErrorResponse = {
    error: {
      code: 'FORBIDDEN',
      message,
    },
  };
  
  return createResponse(403, body);
};

/**
 * Not found error response with 404 status
 */
export const notFoundResponse = (
  resource: string = 'Resource'
): APIGatewayProxyResult => {
  const body: ErrorResponse = {
    error: {
      code: 'NOT_FOUND',
      message: `${resource} not found`,
    },
  };
  
  return createResponse(404, body);
};

/**
 * Conflict error response with 409 status
 */
export const conflictResponse = (
  message: string,
  details?: unknown
): APIGatewayProxyResult => {
  const body: ErrorResponse = {
    error: {
      code: 'CONFLICT',
      message,
      details: details,
    },
  };
  
  return createResponse(409, body);
};

/**
 * Internal server error response with 500 status
 */
export const internalServerErrorResponse = (
  message: string = 'An internal error occurred',
  error?: Error
): APIGatewayProxyResult => {
  const body: ErrorResponse = {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message,
    },
  };
  
  if (error) {
    logger.error('Internal server error', error);
  }
  
  return createResponse(500, body);
};

/**
 * Validation error response for Zod errors
 */
export const validationErrorResponse = (
  zodError: ZodError
): APIGatewayProxyResult => {
  const formattedErrors = zodError.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }));
  
  const body: ErrorResponse = {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: formattedErrors,
    },
  };
  
  logger.warn('Validation error', { errors: formattedErrors });
  return createResponse(400, body);
};

/**
 * Handle errors and return appropriate response
 */
export const handleError = (error: unknown): APIGatewayProxyResult => {
  // Zod validation errors
  if (error instanceof ZodError) {
    return validationErrorResponse(error);
  }
  
  // Standard JavaScript errors
  if (error instanceof Error) {
    // Check for specific error types
    if (error.message.includes('not found')) {
      return notFoundResponse();
    }
    
    if (error.message.includes('already exists')) {
      return conflictResponse(error.message);
    }
    
    if (error.message.includes('unauthorized') || error.message.includes('not authenticated')) {
      return unauthorizedResponse(error.message);
    }
    
    if (error.message.includes('forbidden') || error.message.includes('not authorized')) {
      return forbiddenResponse(error.message);
    }
    
    // Default to internal server error
    return internalServerErrorResponse(error.message, error);
  }
  
  // Unknown error type
  logger.error('Unknown error type', new Error(String(error)));
  return internalServerErrorResponse('An unexpected error occurred');
};

/**
 * Parse JSON body from API Gateway event
 */
export const parseJsonBody = <T>(body: string | null): T => {
  if (!body) {
    throw new Error('Request body is required');
  }
  
  try {
    return JSON.parse(body) as T;
  } catch (error) {
    throw new Error('Invalid JSON in request body');
  }
};

/**
 * Extract path parameter from API Gateway event
 */
export const getPathParameter = (
  pathParameters: Record<string, string | undefined> | null,
  paramName: string
): string => {
  if (!pathParameters || !pathParameters[paramName]) {
    throw new Error(`Missing required path parameter: ${paramName}`);
  }
  
  return pathParameters[paramName]!;
};

/**
 * Extract query parameter from API Gateway event
 */
export const getQueryParameter = (
  queryStringParameters: Record<string, string | undefined> | null,
  paramName: string,
  defaultValue?: string
): string | undefined => {
  if (!queryStringParameters) {
    return defaultValue;
  }
  
  return queryStringParameters[paramName] || defaultValue;
};
