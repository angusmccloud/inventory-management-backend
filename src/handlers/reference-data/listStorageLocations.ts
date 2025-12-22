/**
 * GET /families/{familyId}/locations
 * List all storage locations for the family
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
import { listStorageLocations } from '../../lib/reference-data/storage-location.service.js';

export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);

  logLambdaInvocation('listStorageLocations', event, context.awsRequestId);

  try {
    // Get authenticated user context
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');

    // Ensure user can only access their own family
    await requireFamilyAccess(userContext, familyId);

    // List storage locations
    const locations = await listStorageLocations(familyId, userContext);

    logger.info('Storage locations listed successfully', {
      familyId,
      count: locations.length,
    });

    logLambdaCompletion('listStorageLocations', Date.now() - startTime, context.awsRequestId);

    return okResponse({ locations });
  } catch (error) {
    logger.error('Failed to list storage locations', error as Error);
    return handleError(error);
  }
};
