/**
 * Update Shopping List Item Handler
 * PUT /families/{familyId}/shopping-list/{shoppingItemId}
 * Feature: 002-shopping-lists
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { ShoppingListService } from '../../services/shoppingListService';
import { UpdateShoppingListItemSchema } from '../../types/shoppingList';
import { 
  okResponse, 
  conflictResponse,
  handleError, 
  parseJsonBody,
  getPathParameter
} from '../../lib/response';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../../lib/logger';
import { getUserContext, requireFamilyAccess, requireAdmin } from '../../lib/auth';

/**
 * PUT /families/{familyId}/shopping-list/{shoppingItemId}
 * Update shopping list item details (not status)
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('updateShoppingListItem', event, context.awsRequestId);

  try {
    // Get authenticated user context
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const shoppingItemId = getPathParameter(event.pathParameters, 'shoppingItemId');

    // Ensure user can access this family
    await requireFamilyAccess(userContext, familyId);

    // Only admins can update shopping list items
    await requireAdmin(userContext, familyId);

    // Parse and validate request body
    const body = parseJsonBody(event.body);
    const validatedData = UpdateShoppingListItemSchema.parse(body);

    // Update shopping list item
    const result = await ShoppingListService.updateShoppingListItem(
      familyId,
      shoppingItemId,
      validatedData
    );

    if (!result.success && result.conflict) {
      // Optimistic locking conflict
      logger.warn('Optimistic locking conflict on update', {
        shoppingItemId,
        familyId,
        expectedVersion: validatedData.version,
        currentVersion: result.conflict.currentItem.version,
      });

      return conflictResponse({
        error: 'Conflict',
        message: result.conflict.message,
        currentItem: result.conflict.currentItem,
      });
    }

    logger.info('Updated shopping list item', { 
      shoppingItemId,
      familyId,
      version: result.item!.version,
    });

    logLambdaCompletion('updateShoppingListItem', Date.now() - startTime, context.awsRequestId);

    return okResponse(result.item!);
  } catch (error) {
    logger.error('Failed to update shopping list item', error as Error);
    return handleError(error);
  }
};

