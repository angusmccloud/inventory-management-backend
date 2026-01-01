import { APIGatewayProxyHandler } from 'aws-lambda';
import { SuggestionService } from '../../services/suggestions.js';
import { successResponse, handleError, getPathParameter } from '../../lib/response.js';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../../lib/logger.js';
import { getUserContext, requireFamilyAccess, requireAdmin } from '../../lib/auth.js';
import { handleWarmup, warmupResponse } from '../../lib/warmup.js';

/**
 * POST /families/{familyId}/suggestions/{suggestionId}/approve
 * Approve a suggestion and execute the associated action (admin only)
 * For add_to_shopping: creates ShoppingListItem
 * For create_item: creates InventoryItem
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  // Handle warmup events - exit early to avoid unnecessary processing
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);

  logLambdaInvocation('approveSuggestion', event, context.awsRequestId);

  try {
    // Get authenticated user context
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const suggestionId = getPathParameter(event.pathParameters, 'suggestionId');

    // Ensure user can only access their own family
    await requireFamilyAccess(userContext, familyId);

    // Only admins can approve suggestions
    await requireAdmin(userContext, familyId);

    // Approve suggestion (service handles validation and atomic execution)
    const suggestion = await SuggestionService.approveSuggestion(
      familyId,
      suggestionId,
      userContext.memberId
    );

    logger.info('Suggestion approved successfully', {
      suggestionId,
      familyId,
      type: suggestion.type,
      reviewedBy: userContext.memberId,
    });

    logLambdaCompletion('approveSuggestion', Date.now() - startTime, context.awsRequestId);

    return successResponse(suggestion, 'Suggestion approved successfully');
  } catch (error) {
    logger.error('Failed to approve suggestion', error as Error);

    // Handle specific error cases
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('already been reviewed')) {
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

    if (errorMessage.includes('item with this name already exists')) {
      return {
        statusCode: 409,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: {
            code: 'DUPLICATE_NAME',
            message: 'An item with this name already exists',
          },
        }),
      };
    }

    if (errorMessage.includes('no longer exists') || errorMessage.includes('is archived')) {
      return {
        statusCode: 422,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: {
            code: 'ITEM_DELETED',
            message: 'Referenced inventory item no longer exists or is archived',
          },
        }),
      };
    }

    return handleError(error);
  }
};
