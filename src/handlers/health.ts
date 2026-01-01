import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { successResponse } from '../lib/response.js';
import { logger } from '../lib/logger.js';
import { handleWarmup, warmupResponse } from '../lib/warmup.js';

/**
 * Health check endpoint handler
 * Returns API status and basic system information
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  // Handle warmup events - exit early to avoid unnecessary processing
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  try {
    logger.info('Health check request', {
      requestId: event.requestContext.requestId,
    });

    return successResponse({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env['NODE_ENV'] || 'unknown',
      version: '1.0.0',
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error('Health check failed', err);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        status: 'unhealthy',
        error: err.message,
      }),
    };
  }
};
