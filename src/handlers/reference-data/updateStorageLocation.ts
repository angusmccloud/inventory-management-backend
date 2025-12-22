/**
 * PUT /families/{familyId}/locations/{locationId}
 * Update a storage location
 * Feature: 005-reference-data
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  okResponse,
  handleError,
  getPathParameter,
  parseJsonBody,
} from '../../lib/response.js';
import {
  createLambdaLogger,
  logLambdaInvocation,
  logLambdaCompletion,
} from '../../lib/logger.js';
import { getUserContext, requireFamilyAccess, requireAdmin } from '../../lib/auth.js';
import { updateStorageLocation } from '../../lib/reference-data/storage-location.service.js';
import { UpdateStorageLocationSchema } from '../../lib/reference-data/schemas';

export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);

  logLambdaInvocation('updateStorageLocation', event, context.awsRequestId);

  try {
    // Get authenticated user context
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const locationId = getPathParameter(event.pathParameters, 'locationId');

    // Ensure user can only access their own family
    await requireFamilyAccess(userContext, familyId);

    // Only admins can update storage locations
    await requireAdmin(userContext, familyId);

    // Parse and validate request body
    const body = parseJsonBody(event.body);
    const validatedData = UpdateStorageLocationSchema.parse(body);

    // Update storage location
    const location = await updateStorageLocation(familyId, userContext, locationId, validatedData);

    logger.info('Storage location updated successfully', {
      locationId,
      familyId,
      version: location.version,
    });

    logLambdaCompletion('updateStorageLocation', Date.now() - startTime, context.awsRequestId);

    return okResponse(location);
  } catch (error) {
    logger.error('Failed to update storage location', error as Error);
    return handleError(error);
  }
};
