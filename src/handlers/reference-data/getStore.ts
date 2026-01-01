/**
 * GET /families/{familyId}/stores/{storeId}
 * Get a specific store
 * Feature: 005-reference-data
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  okResponse,
  handleError,
  getPathParameter,
} from '../../lib/response.js';
import {
  createLambdaLogger,
  logLambdaInvocation,
  logLambdaCompletion,
} from '../../lib/logger.js';
import { getUserContext, requireFamilyAccess } from '../../lib/auth.js';
import { getStore } from '../../lib/reference-data/store.service.js';
import { NotFoundError } from '../../lib/reference-data/errors';
import { handleWarmup, warmupResponse } from '../../lib/warmup.js';

export const handler: APIGatewayProxyHandler = async (event, context) => {
  // Handle warmup events - exit early to avoid unnecessary processing
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);

  logLambdaInvocation('getStore', event, context.awsRequestId);

  try {
    // Get authenticated user context
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const storeId = getPathParameter(event.pathParameters, 'storeId');

    // Ensure user can only access their own family
    await requireFamilyAccess(userContext, familyId);

    // Get store
    const store = await getStore(familyId, userContext, storeId);

    if (!store) {
      throw new NotFoundError('Store', storeId);
    }

    logger.info('Store retrieved successfully', {
      storeId,
      familyId,
    });

    logLambdaCompletion('getStore', Date.now() - startTime, context.awsRequestId);

    return okResponse(store);
  } catch (error) {
    logger.error('Failed to get store', error as Error);
    return handleError(error);
  }
};
