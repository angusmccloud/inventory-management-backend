/**
 * PUT /families/{familyId}/stores/{storeId}
 * Update a store
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
import { updateStore } from '../../lib/reference-data/store.service.js';
import { UpdateStoreSchema } from '../../lib/reference-data/schemas';

export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);

  logLambdaInvocation('updateStore', event, context.awsRequestId);

  try {
    // Get authenticated user context
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const storeId = getPathParameter(event.pathParameters, 'storeId');

    // Ensure user can only access their own family
    await requireFamilyAccess(userContext, familyId);

    // Only admins can update stores
    await requireAdmin(userContext, familyId);

    // Parse and validate request body
    const body = parseJsonBody(event.body);
    const validatedData = UpdateStoreSchema.parse(body);

    // Update store
    const store = await updateStore(familyId, userContext, storeId, validatedData);

    logger.info('Store updated successfully', {
      storeId,
      familyId,
      version: store.version,
    });

    logLambdaCompletion('updateStore', Date.now() - startTime, context.awsRequestId);

    return okResponse(store);
  } catch (error) {
    logger.error('Failed to update store', error as Error);
    return handleError(error);
  }
};
