/**
 * GET /families/{familyId}/stores
 * List all stores for the family
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
import { listStores } from '../../lib/reference-data/store.service.js';

export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);

  logLambdaInvocation('listStores', event, context.awsRequestId);

  try {
    // Get authenticated user context
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');

    // Ensure user can only access their own family
    await requireFamilyAccess(userContext, familyId);

    // List stores
    const stores = await listStores(familyId, userContext);

    logger.info('Stores listed successfully', {
      familyId,
      count: stores.length,
    });

    logLambdaCompletion('listStores', Date.now() - startTime, context.awsRequestId);

    return okResponse({ stores });
  } catch (error) {
    logger.error('Failed to list stores', error as Error);
    return handleError(error);
  }
};
