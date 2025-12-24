/**
 * List Shopping List Items Handler
 * GET /families/{familyId}/shopping-list
 * Feature: 002-shopping-lists
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { ShoppingListService } from '../../services/shoppingListService';
import { ShoppingListItem } from '../../types/shoppingList';
import { StoreModel } from '../../models/store';
import { 
  okResponse, 
  handleError, 
  getPathParameter
} from '../../lib/response';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../../lib/logger';
import { getUserContext, requireFamilyAccess } from '../../lib/auth';

/**
 * GET /families/{familyId}/shopping-list
 * List shopping list items (supports filtering by store and status)
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('listShoppingListItems', event, context.awsRequestId);

  try {
    // Get authenticated user context
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');

    // Ensure user can access this family (any member can view shopping list)
    await requireFamilyAccess(userContext, familyId);

    // Parse query parameters
    const storeId = event.queryStringParameters?.['storeId'] === 'unassigned'
      ? null
      : event.queryStringParameters?.['storeId'];
    const status = event.queryStringParameters?.['status'] as 'pending' | 'purchased' | undefined;

    // Get shopping list items
    const items = await ShoppingListService.listShoppingListItems(familyId, {
      storeId: storeId !== undefined ? storeId : undefined,
      status,
    });

    // Denormalize store names
    const storeIds = [...new Set(items.map(item => item.storeId).filter(Boolean))] as string[];
    const stores = await Promise.all(
      storeIds.map(id => StoreModel.getById(familyId, id))
    );
    const storeMap = new Map(stores.filter(Boolean).map(store => [store!.storeId, store!.name]));

    // Add storeName to each item
    const itemsWithStoreNames = items.map(item => ({
      ...item,
      storeName: item.storeId ? storeMap.get(item.storeId) || null : null,
    }));

    // Group by store for convenience
    const grouped = await ShoppingListService.groupByStore(familyId, status);
    const groupedByStore = await Promise.all(
      Object.entries(grouped).map(async ([storeKey, storeItems]) => {
        const storeName = storeKey === 'unassigned' 
          ? 'Unassigned' 
          : storeMap.get(storeKey) || storeKey;
        
        return {
          storeId: storeKey === 'unassigned' ? null : storeKey,
          storeName,
          itemCount: (storeItems as ShoppingListItem[]).length,
          pendingCount: (storeItems as ShoppingListItem[]).filter((item: ShoppingListItem) => item.status === 'pending').length,
        };
      })
    );

    logger.info('Listed shopping list items', { 
      familyId,
      count: items.length,
      storeFilter: storeId,
      statusFilter: status,
    });

    logLambdaCompletion('listShoppingListItems', Date.now() - startTime, context.awsRequestId);

    return okResponse({
      items: itemsWithStoreNames,
      groupedByStore,
    });
  } catch (error) {
    logger.error('Failed to list shopping list items', error as Error);
    return handleError(error);
  }
};

