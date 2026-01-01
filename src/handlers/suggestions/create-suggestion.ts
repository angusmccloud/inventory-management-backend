import { APIGatewayProxyHandler } from 'aws-lambda';
import { SuggestionService } from '../../services/suggestions.js';
import { createSuggestionRequestSchema } from '../../types/schemas.js';
import {
  createdResponse,
  handleError,
  parseJsonBody,
  getPathParameter,
} from '../../lib/response.js';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../../lib/logger.js';
import { getUserContext, requireFamilyAccess, requireSuggester } from '../../lib/auth.js';
import { handleWarmup, warmupResponse } from '../../lib/warmup.js';

/**
 * POST /families/{familyId}/suggestions
 * Create a new suggestion (suggester role only)
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  // Handle warmup events - exit early to avoid unnecessary processing
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);

  logLambdaInvocation('createSuggestion', event, context.awsRequestId);

  try {
    // Get authenticated user context
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');

    // Ensure user can only access their own family
    await requireFamilyAccess(userContext, familyId);

    // Only suggesters can create suggestions
    await requireSuggester(userContext, familyId);

    // Parse and validate request body
    const body = parseJsonBody(event.body);
    const validatedData = createSuggestionRequestSchema.parse(body);

    // Create suggestion based on type
    let suggestion;
    if (validatedData.type === 'add_to_shopping') {
      suggestion = await SuggestionService.createSuggestion(
        familyId,
        userContext.memberId,
        'add_to_shopping',
        {
          itemId: validatedData.itemId,
          notes: validatedData.notes,
        }
      );
    } else {
      // create_item type
      suggestion = await SuggestionService.createSuggestion(
        familyId,
        userContext.memberId,
        'create_item',
        {
          proposedItemName: validatedData.proposedItemName,
          proposedQuantity: validatedData.proposedQuantity,
          proposedThreshold: validatedData.proposedThreshold,
          notes: validatedData.notes,
        }
      );
    }

    logger.info('Suggestion created successfully', {
      suggestionId: suggestion.suggestionId,
      familyId,
      type: suggestion.type,
    });

    logLambdaCompletion('createSuggestion', Date.now() - startTime, context.awsRequestId);

    return createdResponse(suggestion, 'Suggestion created successfully');
  } catch (error) {
    logger.error('Failed to create suggestion', error as Error);
    return handleError(error);
  }
};
