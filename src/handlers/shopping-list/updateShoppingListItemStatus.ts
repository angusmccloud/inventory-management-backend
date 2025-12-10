/**
 * Update Shopping List Item Status Handler
 * PATCH /families/{familyId}/shopping-list/{shoppingItemId}/status
 * Feature: 002-shopping-lists
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { ShoppingListService } from '../../services/shoppingListService';
import { UpdateStatusSchema } from '../../types/shoppingList';
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
 * PATCH /families/{familyId}/shopping-list/{shoppingItemId}/status
 * Update shopping list item status (toggle purchased)
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('updateShoppingListItemStatus', event, context.awsRequestId);

  try {
    // Get authenticated user context
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const shoppingItemId = getPathParameter(event.pathParameters, 'shoppingItemId');

    // Ensure user can access this family
    await requireFamilyAccess(userContext, familyId);

    // Only admins can update shopping list status
    await requireAdmin(userContext, familyId);

    // Parse and validate request body
    const body = parseJsonBody(event.body);
    const validatedData = UpdateStatusSchema.parse(body);

    // Update status
    const result = await ShoppingListService.updateStatus(
      familyId,
      shoppingItemId,
      validatedData
    );

    if (!result.success && result.conflict) {
      // Optimistic locking conflict
      logger.warn('Optimistic locking conflict on status update', {
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

    logger.info('Updated shopping list item status', { 
      shoppingItemId,
      familyId,
      status: validatedData.status,
      version: result.item!.version,
      ttl: result.item!.ttl,
    });

    logLambdaCompletion('updateShoppingListItemStatus', Date.now() - startTime, context.awsRequestId);

    return okResponse(result.item!);
  } catch (error) {
    logger.error('Failed to update shopping list item status', error as Error);
    return handleError(error);
  }
};

