/**
 * Get Shopping List Item Handler
 * GET /families/{familyId}/shopping-list/{shoppingItemId}
 * Feature: 002-shopping-lists
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { ShoppingListService } from '../../services/shoppingListService';
import { 
  okResponse, 
  notFoundResponse,
  handleError, 
  getPathParameter
} from '../../lib/response';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../../lib/logger';
import { getUserContext, requireFamilyAccess } from '../../lib/auth';

/**
 * GET /families/{familyId}/shopping-list/{shoppingItemId}
 * Get single shopping list item
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('getShoppingListItem', event, context.awsRequestId);

  try {
    // Get authenticated user context
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const shoppingItemId = getPathParameter(event.pathParameters, 'shoppingItemId');

    // Ensure user can access this family (any member can view shopping list)
    await requireFamilyAccess(userContext, familyId);

    // Get shopping list item
    const item = await ShoppingListService.getShoppingListItem(familyId, shoppingItemId);

    if (!item) {
      return notFoundResponse('Shopping list item not found');
    }

    logger.info('Retrieved shopping list item', { 
      shoppingItemId,
      familyId 
    });

    logLambdaCompletion('getShoppingListItem', Date.now() - startTime, context.awsRequestId);

    return okResponse(item);
  } catch (error) {
    logger.error('Failed to get shopping list item', error as Error);
    return handleError(error);
  }
};

