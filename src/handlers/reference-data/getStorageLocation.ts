/**
 * GET /families/{familyId}/locations/{locationId}
 * Get a specific storage location
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
import { getStorageLocation } from '../../lib/reference-data/storage-location.service.js';
import { NotFoundError } from '../../lib/reference-data/errors';
import { handleWarmup, warmupResponse } from '../../lib/warmup.js';

export const handler: APIGatewayProxyHandler = async (event, context) => {
  // Handle warmup events - exit early to avoid unnecessary processing
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);

  logLambdaInvocation('getStorageLocation', event, context.awsRequestId);

  try {
    // Get authenticated user context
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const locationId = getPathParameter(event.pathParameters, 'locationId');

    // Ensure user can only access their own family
    await requireFamilyAccess(userContext, familyId);

    // Get storage location
    const location = await getStorageLocation(familyId, userContext, locationId);

    if (!location) {
      throw new NotFoundError('StorageLocation', locationId);
    }

    logger.info('Storage location retrieved successfully', {
      locationId,
      familyId,
    });

    logLambdaCompletion('getStorageLocation', Date.now() - startTime, context.awsRequestId);

    return okResponse(location);
  } catch (error) {
    logger.error('Failed to get storage location', error as Error);
    return handleError(error);
  }
};
