/**
 * POST /families/{familyId}/stores
 * Create a new store
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
import { createStore } from '../../lib/reference-data/store.service.js';
import { CreateStoreSchema } from '../../lib/reference-data/schemas';

export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);

  logLambdaInvocation('createStore', event, context.awsRequestId);

  try {
    // Get authenticated user context
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');

    // Ensure user can only access their own family
    await requireFamilyAccess(userContext, familyId);

    // Only admins can create stores
    await requireAdmin(userContext, familyId);

    // Parse and validate request body
    const body = parseJsonBody(event.body);
    const validatedData = CreateStoreSchema.parse(body);

    // Create store
    const store = await createStore(familyId, userContext, validatedData);

    logger.info('Store created successfully', {
      storeId: store.storeId,
      familyId,
    });

    logLambdaCompletion('createStore', Date.now() - startTime, context.awsRequestId);

    return createdResponse(store, 'Store created successfully');
  } catch (error) {
    logger.error('Failed to create store', error as Error);
    return handleError(error);
  }
};
