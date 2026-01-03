/**
 * Update Shopping List Item Handler
 * PUT /families/{familyId}/shopping-list/{shoppingItemId}
 * Feature: 002-shopping-lists
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { ShoppingListService } from '../../services/shoppingListService';
import { UpdateShoppingListItemSchema } from '../../types/shoppingList';
import { StoreModel } from '../../models/store';
import { 
  okResponse, 
  conflictResponse,
  handleError, 
  parseJsonBody,
  getPathParameter
} from '../../lib/response';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../../lib/logger';
import { getUserContext, requireFamilyAccess, requireAdmin } from '../../lib/auth';
import { handleWarmup, warmupResponse } from '../../lib/warmup.js';

/**
 * PUT /families/{familyId}/shopping-list/{shoppingItemId}
 * Update shopping list item details (not status)
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  // Handle warmup events - exit early to avoid unnecessary processing
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

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

      // Denormalize storeName for conflict item
      let conflictStoreName: string | null = null;
      if (result.conflict.currentItem.storeId) {
        const store = await StoreModel.getById(familyId, result.conflict.currentItem.storeId);
        conflictStoreName = store?.name || null;
      }

      return conflictResponse({
        error: 'Conflict',
        message: result.conflict.message,
        currentItem: {
          ...result.conflict.currentItem,
          storeName: conflictStoreName,
        },
      });
    }

    // Denormalize store name if storeId present
    let itemWithStoreName = result.item!;
    if (result.item!.storeId) {
      const store = await StoreModel.getById(familyId, result.item!.storeId);
      itemWithStoreName = {
        ...result.item!,
        storeName: store?.name || null,
      };
    } else {
      // Ensure storeName is null when no storeId
      itemWithStoreName = {
        ...result.item!,
        storeName: null,
      };
    }

    // Add inventoryNotes if item is linked to inventory
    if (result.item!.itemId) {
      try {
        const { InventoryItemModel } = await import('../../models/inventory');
        const inventoryItem = await InventoryItemModel.getById(familyId, result.item!.itemId);
        itemWithStoreName = {
          ...itemWithStoreName,
          inventoryNotes: inventoryItem?.notes || null,
        };
      } catch (err) {
        logger.warn('Failed to fetch inventory notes for updated shopping list item', { 
          itemId: result.item!.itemId, 
          error: err 
        });
      }
    }

    logger.info('Updated shopping list item', { 
      shoppingItemId,
      familyId,
      version: result.item!.version,
    });

    logLambdaCompletion('updateShoppingListItem', Date.now() - startTime, context.awsRequestId);

    return okResponse(itemWithStoreName);
  } catch (error) {
    logger.error('Failed to update shopping list item', error as Error);
    return handleError(error);
  }
};

