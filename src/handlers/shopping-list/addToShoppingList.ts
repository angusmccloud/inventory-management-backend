/**
 * Add to Shopping List Handler
 * POST /families/{familyId}/shopping-list
 * Feature: 002-shopping-lists
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { ShoppingListService } from '../../services/shoppingListService';
import { CreateShoppingListItemSchema } from '../../types/shoppingList';
import { StoreModel } from '../../models/store';
import { 
  createdResponse, 
  conflictResponse,
  notFoundResponse,
  handleError, 
  parseJsonBody,
  getPathParameter
} from '../../lib/response';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../../lib/logger';
import { getUserContext, requireFamilyAccess, requireAdmin } from '../../lib/auth';
import { handleWarmup, warmupResponse } from '../../lib/warmup';

/**
 * POST /families/{familyId}/shopping-list
 * Add item to shopping list
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  // Handle warmup events - exit early to avoid unnecessary processing
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('addToShoppingList', event, context.awsRequestId);

  try {
    // Get authenticated user context
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');

    // Ensure user can access this family
    await requireFamilyAccess(userContext, familyId);

    // Only admins can add to shopping list
    await requireAdmin(userContext, familyId);

    // Parse and validate request body
    const body = parseJsonBody(event.body);
    const validatedData = CreateShoppingListItemSchema.parse(body);

    // Add to shopping list
    const result = await ShoppingListService.addToShoppingList(
      familyId,
      userContext.memberId,
      validatedData
    );

    if (!result.success && result.duplicate) {
      // Duplicate item found
      logger.info('Duplicate shopping list item detected', {
        familyId,
        itemId: validatedData.itemId,
        existingItemId: result.duplicate.item.shoppingItemId,
      });

      // Denormalize storeName for duplicate item
      let duplicateStoreName: string | null = null;
      if (result.duplicate.item.storeId) {
        const store = await StoreModel.getById(familyId, result.duplicate.item.storeId);
        duplicateStoreName = store?.name || null;
      }

      return conflictResponse({
        error: 'Conflict',
        message: result.duplicate.message,
        existingItem: {
          ...result.duplicate.item,
          storeName: duplicateStoreName,
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
        logger.warn('Failed to fetch inventory notes for new shopping list item', { 
          itemId: result.item!.itemId, 
          error: err 
        });
      }
    }

    logger.info('Added item to shopping list', { 
      shoppingItemId: result.item!.shoppingItemId,
      familyId 
    });

    logLambdaCompletion('addToShoppingList', Date.now() - startTime, context.awsRequestId);

    return createdResponse(itemWithStoreName, 'Item added to shopping list');
  } catch (error) {
    if (error instanceof Error && error.message === 'INVENTORY_ITEM_NOT_FOUND') {
      return notFoundResponse('Inventory item not found');
    }
    logger.error('Failed to add item to shopping list', error as Error);
    return handleError(error);
  }
};

