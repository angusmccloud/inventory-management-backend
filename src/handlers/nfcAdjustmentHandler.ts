/**
 * NFC Adjustment Handler
 * 
 * @description Unauthenticated Lambda handler for NFC-triggered inventory adjustments.
 * Handles POST /api/adjust/{urlId} endpoint.
 * 
 * Security: URL ID acts as bearer token (cryptographically random, rotatable)
 * 
 * @see specs/006-api-integration/contracts/nfc-adjustment-api.yaml
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { NfcService } from '../services/nfcService';
import { logger } from '../lib/logger';
import { 
  nfcAdjustmentRequestSchema, 
  urlIdSchema, 
  safeValidateRequest 
} from '../lib/validation/nfcSchemas';
import { handleWarmup, warmupResponse } from '../lib/warmup';

/**
 * CORS headers for unauthenticated endpoint
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

/**
 * Handle NFC inventory adjustment
 * 
 * POST /api/adjust/{urlId}
 * Body: { "delta": -1 | 1 }
 * 
 * No authentication required - URL ID acts as bearer token
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  // Handle warmup events - exit early to avoid unnecessary processing
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  logger.info('NFC adjustment request received', {
    path: event.path,
    method: event.httpMethod,
    sourceIp: event.requestContext.identity.sourceIp,
  });

  try {
    // Handle OPTIONS preflight
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: '',
      };
    }

    // Extract and validate URL ID from path
    const urlId = event.pathParameters?.['urlId'];
    if (!urlId) {
      logger.warn('Missing urlId in path parameters');
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: {
            code: 'MISSING_URL_ID',
            message: 'URL ID is required',
          },
        }),
      };
    }

    // Validate URL ID format
    const urlIdValidation = safeValidateRequest(urlIdSchema, urlId);
    if (!urlIdValidation.success) {
      logger.warn('Invalid URL ID format', { urlId });
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: {
            code: 'INVALID_URL_ID',
            message: 'Invalid URL ID format',
            details: urlIdValidation.error.errors,
          },
        }),
      };
    }

    // Parse and validate request body
    const requestBody = JSON.parse(event.body || '{}');
    const validation = safeValidateRequest(nfcAdjustmentRequestSchema, requestBody);

    if (!validation.success) {
      logger.warn('Invalid request body', { errors: validation.error.errors });
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Invalid request body',
            details: validation.error.errors,
          },
        }),
      };
    }

    const { delta } = validation.data;

    // Adjust inventory
    const result = await NfcService.adjustInventory({ urlId, delta });

    if (!result.success) {
      // Enhanced error tracking for security monitoring (T057)
      logger.warn('Adjustment failed - potential security event', {
        urlId,
        errorCode: result.errorCode,
        sourceIp: event.requestContext?.identity?.sourceIp,
        userAgent: event.headers?.['User-Agent'] || event.headers?.['user-agent'],
        timestamp: new Date().toISOString(),
        // CloudWatch Metrics can pick up these fields for alarms
        metricName: 'InvalidNFCUrlAttempt',
        metricValue: 1,
        metricDimensions: {
          ErrorCode: result.errorCode,
          StatusCode: result.errorCode === 'URL_INVALID' ? '404' : '400',
        },
      });
      
      // Determine appropriate HTTP status code
      let statusCode = 400;
      if (result.errorCode === 'URL_INVALID') {
        statusCode = 404; // URL not found or inactive
      } else if (result.errorCode === 'ITEM_NOT_FOUND') {
        statusCode = 404;
      }

      return {
        statusCode,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: {
            code: result.errorCode,
            message: result.errorMessage,
          },
        }),
      };
    }

    logger.info('Adjustment successful', {
      urlId,
      itemId: result.itemId,
      newQuantity: result.newQuantity,
      delta,
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(result),
    };
  } catch (error) {
    logger.error('NFC adjustment handler error', error as Error);

    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      }),
    };
  }
};
