/**
 * DELETE /families/{familyId}/locations/{locationId}
 * Archive a storage location
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
import { deleteStorageLocation } from '../../lib/reference-data/storage-location.service.js';
import { handleWarmup, warmupResponse } from '../../lib/warmup.js';

export const handler: APIGatewayProxyHandler = async (event, context) => {
  // Handle warmup events - exit early to avoid unnecessary processing
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);

  logLambdaInvocation('deleteStorageLocation', event, context.awsRequestId);

  try {
    // Get authenticated user context
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const locationId = getPathParameter(event.pathParameters, 'locationId');

    // Ensure user can only access their own family
    await requireFamilyAccess(userContext, familyId);

    // Only admins can archive storage locations
    await requireAdmin(userContext, familyId);

    // Archive storage location
    await deleteStorageLocation(familyId, userContext, locationId);

    logger.info('Storage location archived successfully', {
      locationId,
      familyId,
    });

    logLambdaCompletion('deleteStorageLocation', Date.now() - startTime, context.awsRequestId);

    return noContentResponse();
  } catch (error) {
    logger.error('Failed to archive storage location', error as Error);
    return handleError(error);
  }
};
