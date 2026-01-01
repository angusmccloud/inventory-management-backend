/**
 * Lambda Warmup Utility
 * 
 * Provides functionality to detect warmup events and exit early
 * to avoid unnecessary processing and reduce cold start impacts.
 */

import type { Context } from 'aws-lambda';
import { logger } from './logger.js';

/**
 * Check if the current invocation is a warmup ping
 * Warmup events are identified by the source field in the event
 */
export const isWarmupEvent = (event: any): boolean => {
  // Check for orchestrator warmup event (new pattern)
  if (event.source === 'warmup.orchestrator' || event.warmup === true) {
    return true;
  }
  
  // Legacy: Check if this is an EventBridge warmup event
  if (event.source === 'serverless-plugin-warmup' || 
      event['detail-type'] === 'Scheduled Event' && 
      event.source === 'aws.events' &&
      event.resources?.[0]?.includes?.('warmup')) {
    return true;
  }
  
  return false;
};

/**
 * Exit early if this is a warmup event
 * Returns true if warmup (so handler can return early)
 * Returns false if normal execution should continue
 */
export const handleWarmup = (event: any, context: Context): boolean => {
  if (isWarmupEvent(event)) {
    logger.info('Warmup event detected - exiting early', {
      requestId: context.awsRequestId,
      functionName: context.functionName,
      source: event.source,
    });
    return true;
  }
  return false;
};

/**
 * Response to return for warmup events
 */
export const warmupResponse = () => ({
  statusCode: 200,
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ 
    message: 'Lambda warmed up successfully',
    timestamp: new Date().toISOString()
  }),
});
