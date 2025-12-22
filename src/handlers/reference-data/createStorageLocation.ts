/**
 * POST /families/{familyId}/locations
 * Create a new storage location
 * Feature: 005-reference-data
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  createdResponse,
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
import { createStorageLocation } from '../../lib/reference-data/storage-location.service.js';
import { CreateStorageLocationSchema } from '../../lib/reference-data/schemas';

export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);

  logLambdaInvocation('createStorageLocation', event, context.awsRequestId);

  try {
    // Get authenticated user context
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');

    // Ensure user can only access their own family
    await requireFamilyAccess(userContext, familyId);

    // Only admins can create storage locations
    await requireAdmin(userContext, familyId);

    // Parse and validate request body
    const body = parseJsonBody(event.body);
    const validatedData = CreateStorageLocationSchema.parse(body);

    // Create storage location
    const location = await createStorageLocation(familyId, userContext, validatedData);

    logger.info('Storage location created successfully', {
      locationId: location.locationId,
      familyId,
    });

    logLambdaCompletion('createStorageLocation', Date.now() - startTime, context.awsRequestId);

    return createdResponse(location, 'Storage location created successfully');
  } catch (error) {
    logger.error('Failed to create storage location', error as Error);
    return handleError(error);
  }
};
