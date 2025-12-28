import { APIGatewayProxyHandler } from 'aws-lambda';
import { SuggestionService } from '../../services/suggestions.js';
import {
  successResponse,
  handleError,
  getPathParameter,
  notFoundResponse,
} from '../../lib/response.js';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../../lib/logger.js';
import { getUserContext, requireFamilyAccess } from '../../lib/auth.js';

/**
 * GET /families/{familyId}/suggestions/{suggestionId}
 * Get a specific suggestion
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);

  logLambdaInvocation('getSuggestion', event, context.awsRequestId);

  try {
    // Get authenticated user context
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const suggestionId = getPathParameter(event.pathParameters, 'suggestionId');

    // Ensure user can only access their own family
    await requireFamilyAccess(userContext, familyId);

    // Get suggestion
    const suggestion = await SuggestionService.getSuggestion(familyId, suggestionId);

    if (!suggestion) {
      return notFoundResponse('Suggestion');
    }

    logger.info('Suggestion retrieved successfully', { familyId, suggestionId });

    logLambdaCompletion('getSuggestion', Date.now() - startTime, context.awsRequestId);

    return successResponse(suggestion);
  } catch (error) {
    logger.error('Failed to get suggestion', error as Error);
    return handleError(error);
  }
};
