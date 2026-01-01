import { APIGatewayProxyHandler } from 'aws-lambda';
import { SuggestionService } from '../../services/suggestions.js';
import { successResponse, handleError, getPathParameter } from '../../lib/response.js';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../../lib/logger.js';
import { getUserContext, requireFamilyAccess } from '../../lib/auth.js';
import { SuggestionStatus } from '../../types/entities.js';
import { handleWarmup, warmupResponse } from '../../lib/warmup.js';

/**
 * GET /families/{familyId}/suggestions
 * List suggestions for a family with optional status filter and pagination
 * Query parameters:
 * - status: 'pending' | 'approved' | 'rejected' (optional)
 * - limit: number (optional, default 20)
 * - nextToken: string (optional, for pagination)
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  // Handle warmup events - exit early to avoid unnecessary processing
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);

  logLambdaInvocation('listSuggestions', event, context.awsRequestId);

  try {
    // Get authenticated user context
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');

    // Ensure user can only access their own family
    await requireFamilyAccess(userContext, familyId);

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const status = queryParams['status'] as SuggestionStatus | undefined;
    const limit = queryParams['limit'] ? parseInt(queryParams['limit'], 10) : 20;
    const nextToken = queryParams['nextToken'];

    // Validate status if provided
    if (status && !['pending', 'approved', 'rejected'].includes(status)) {
      throw new Error('Invalid status value. Must be pending, approved, or rejected');
    }

    // List suggestions
    const result = await SuggestionService.listSuggestions(familyId, {
      status,
      limit,
      nextToken,
    });

    logger.info('Suggestions listed successfully', {
      familyId,
      count: result.suggestions.length,
      status,
    });

    logLambdaCompletion('listSuggestions', Date.now() - startTime, context.awsRequestId);

    return successResponse(result);
  } catch (error) {
    logger.error('Failed to list suggestions', error as Error);
    return handleError(error);
  }
};
