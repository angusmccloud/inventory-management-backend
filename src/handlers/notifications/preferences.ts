/**
 * Preferences Handler
 *
 * GET  /families/{familyId}/members/{memberId}/preferences/notifications
 * PATCH /families/{familyId}/members/{memberId}/preferences/notifications
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import * as PreferencesService from '../../services/notifications/preferencesService';
import {
  successResponse,
  handleError,
  getPathParameter,
  badRequestResponse,
} from '../../lib/response.js';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../../lib/logger.js';
import { getUserContext, requireFamilyAccess } from '../../lib/auth.js';
import { handleWarmup, warmupResponse } from '../../lib/warmup.js';

export const handler: APIGatewayProxyHandler = async (event, context) => {
  if (handleWarmup(event, context)) return warmupResponse();

  const start = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  logLambdaInvocation('preferences', event, context.awsRequestId);

  try {
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const memberId = getPathParameter(event.pathParameters, 'memberId');

    await requireFamilyAccess(userContext, familyId);

    if (event.httpMethod === 'GET') {
      // Ensure member is requesting their own preferences
      if (userContext.memberId !== memberId) {
        return badRequestResponse('Forbidden', { reason: 'Can only access own preferences' });
      }

      const result = await PreferencesService.getPreferences(familyId, memberId);
      logLambdaCompletion('preferences:get', Date.now() - start, context.awsRequestId);
      return successResponse(result);
    }

    if (event.httpMethod === 'PATCH') {
      if (!event.body) return badRequestResponse('Missing request body');
      let body: any;
      try {
        body = JSON.parse(event.body);
      } catch (err) {
        return badRequestResponse('Invalid JSON body');
      }

      const { preferences, unsubscribeAllEmail, expectedVersion } = body;
      if (!Array.isArray(preferences)) return badRequestResponse('Invalid preferences payload');

      const updated = await PreferencesService.updatePreferences(
        familyId,
        memberId,
        preferences,
        unsubscribeAllEmail,
        expectedVersion
      );

      logLambdaCompletion('preferences:patch', Date.now() - start, context.awsRequestId);
      return successResponse({ data: updated });
    }

    return badRequestResponse('Unsupported method');
  } catch (error) {
    logger.error('Preferences handler failed', error as Error);
    return handleError(error);
  }
};
