import { APIGatewayProxyHandler } from 'aws-lambda';
import { SuggestionService } from '../../services/suggestions.js';
import { reviewSuggestionRequestSchema } from '../../types/schemas.js';
import {
  successResponse,
  handleError,
  parseJsonBody,
  getPathParameter,
} from '../../lib/response.js';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../../lib/logger.js';
import { getUserContext, requireFamilyAccess, requireAdmin } from '../../lib/auth.js';
import { handleWarmup, warmupResponse } from '../../lib/warmup.js';

/**
 * POST /families/{familyId}/suggestions/{suggestionId}/reject
 * Reject a suggestion with optional notes (admin only)
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  // Handle warmup events - exit early to avoid unnecessary processing
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);

  logLambdaInvocation('rejectSuggestion', event, context.awsRequestId);

  try {
    // Get authenticated user context
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const suggestionId = getPathParameter(event.pathParameters, 'suggestionId');

    // Ensure user can only access their own family
    await requireFamilyAccess(userContext, familyId);

    // Only admins can reject suggestions
    await requireAdmin(userContext, familyId);

    // Parse and validate request body (optional rejection notes)
    const body = event.body ? parseJsonBody(event.body) : {};
    const validatedData = reviewSuggestionRequestSchema.parse(body);

    // Reject suggestion
    const suggestion = await SuggestionService.rejectSuggestion(
      familyId,
      suggestionId,
      userContext.memberId,
      validatedData.rejectionNotes
    );

    logger.info('Suggestion rejected successfully', {
      suggestionId,
      familyId,
      reviewedBy: userContext.memberId,
      hasNotes: !!validatedData.rejectionNotes,
    });

    logLambdaCompletion('rejectSuggestion', Date.now() - startTime, context.awsRequestId);

    return successResponse(suggestion, 'Suggestion rejected successfully');
  } catch (error) {
    logger.error('Failed to reject suggestion', error as Error);

    // Handle specific error cases
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('already been reviewed') || errorMessage.includes('version mismatch')) {
      return {
        statusCode: 409,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: {
            code: 'CONFLICT',
            message: 'Suggestion has already been reviewed',
          },
        }),
      };
    }

    return handleError(error);
  }
};
