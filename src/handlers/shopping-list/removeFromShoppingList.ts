/**
 * Remove from Shopping List Handler
 * DELETE /families/{familyId}/shopping-list/{shoppingItemId}
 * Feature: 002-shopping-lists
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { ShoppingListService } from '../../services/shoppingListService';
import { 
  noContentResponse, 
  handleError, 
  getPathParameter
} from '../../lib/response';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../../lib/logger';
import { getUserContext, requireFamilyAccess, requireAdmin } from '../../lib/auth';

/**
 * DELETE /families/{familyId}/shopping-list/{shoppingItemId}
 * Remove item from shopping list
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('removeFromShoppingList', event, context.awsRequestId);

  try {
    // Get authenticated user context
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const shoppingItemId = getPathParameter(event.pathParameters, 'shoppingItemId');

    // Ensure user can access this family
    await requireFamilyAccess(userContext, familyId);

    // Only admins can remove from shopping list
    await requireAdmin(userContext, familyId);

    // Remove from shopping list
    await ShoppingListService.removeFromShoppingList(familyId, shoppingItemId);

    logger.info('Removed item from shopping list', { 
      shoppingItemId,
      familyId 
    });

    logLambdaCompletion('removeFromShoppingList', Date.now() - startTime, context.awsRequestId);

    return noContentResponse();
  } catch (error) {
    logger.error('Failed to remove item from shopping list', error as Error);
    return handleError(error);
  }
};

