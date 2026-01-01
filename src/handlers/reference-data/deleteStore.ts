/**
 * DELETE /families/{familyId}/stores/{storeId}
 * Delete a store
 * Feature: 005-reference-data
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  noContentResponse,
  handleError,
  getPathParameter,
} from '../../lib/response.js';
import {
  createLambdaLogger,
  logLambdaInvocation,
  logLambdaCompletion,
} from '../../lib/logger.js';
import { getUserContext, requireFamilyAccess, requireAdmin } from '../../lib/auth.js';
import { deleteStore } from '../../lib/reference-data/store.service.js';
import { handleWarmup, warmupResponse } from '../../lib/warmup.js';

export const handler: APIGatewayProxyHandler = async (event, context) => {
  // Handle warmup events - exit early to avoid unnecessary processing
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);

  logLambdaInvocation('deleteStore', event, context.awsRequestId);

  try {
    // Get authenticated user context
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const storeId = getPathParameter(event.pathParameters, 'storeId');

    // Ensure user can only access their own family
    await requireFamilyAccess(userContext, familyId);

    // Only admins can delete stores
    await requireAdmin(userContext, familyId);

    // Delete store
    await deleteStore(familyId, userContext, storeId);

    logger.info('Store deleted successfully', {
      storeId,
      familyId,
    });

    logLambdaCompletion('deleteStore', Date.now() - startTime, context.awsRequestId);

    return noContentResponse();
  } catch (error) {
    logger.error('Failed to delete store', error as Error);
    return handleError(error);
  }
};
