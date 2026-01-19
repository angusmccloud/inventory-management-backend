/**
 * ShoppingListService
 * Business logic for shopping list management
 * Feature: 002-shopping-lists
 */

import { ShoppingListModel } from '../models/shoppingList';
import { InventoryItemModel } from '../models/inventory';
import { NotificationService } from './notificationService';
import { logger } from '../lib/logger';
import {
  ShoppingListItem,
  ShoppingListStatus,
  CreateShoppingListItemRequest,
  UpdateShoppingListItemRequest,
  UpdateStatusRequest,
} from '../types/shoppingList';

/**
 * Result of adding an item to shopping list with duplicate detection
 */
export interface AddToShoppingListResult {
  success: boolean;
  item?: ShoppingListItem;
  duplicate?: {
    item: ShoppingListItem;
    message: string;
  };
}

/**
 * Result of updating an item with optimistic locking
 */
export interface UpdateResult {
  success: boolean;
  item?: ShoppingListItem;
  conflict?: {
    currentItem: ShoppingListItem;
    message: string;
  };
}

export class ShoppingListService {
  /**
   * Add an item to the shopping list
   * Handles duplicate detection for inventory-linked items
   * Auto-populates name and store from inventory if itemId provided
   */
  static async addToShoppingList(
    familyId: string,
    addedBy: string,
    request: CreateShoppingListItemRequest
  ): Promise<AddToShoppingListResult> {
    let itemName = request.name;
    let storeId = request.storeId;
    let unit = request.unit;

    // If itemId provided, get inventory item details
    if (request.itemId) {
      // Check for duplicate first (unless force=true)
      if (!request.force) {
        const duplicate = await ShoppingListModel.findDuplicateByItemId(familyId, request.itemId);
        if (duplicate) {
          logger.info('Duplicate shopping list item found', {
            familyId,
            itemId: request.itemId,
            existingShoppingItemId: duplicate.shoppingItemId,
          });

          return {
            success: false,
            duplicate: {
              item: duplicate,
              message: 'This item is already on your shopping list',
            },
          };
        }
      }

      // Get inventory item to populate name, store, and unit
      const inventoryItem = await InventoryItemModel.getById(familyId, request.itemId);
      if (!inventoryItem) {
        throw new Error('INVENTORY_ITEM_NOT_FOUND');
      }

      // Use inventory item name if not provided in request
      itemName = request.name || inventoryItem.name;

      // Use inventory item's preferred store if not provided in request
      storeId = request.storeId !== undefined ? request.storeId : inventoryItem.preferredStoreId;
      
      // Use inventory item's unit if not provided in request
      unit = request.unit !== undefined ? request.unit : inventoryItem.unit;
    }

    // Validate we have a name
    if (!itemName) {
      throw new Error('Item name is required');
    }

    // Create the shopping list item
    const item = await ShoppingListModel.create(familyId, addedBy, {
      ...request,
      name: itemName,
      storeId: storeId || null,
      unit: unit || null,
    });

    logger.info('Added item to shopping list', {
      shoppingItemId: item.shoppingItemId,
      familyId,
      itemId: request.itemId,
      addedBy,
    });

    if (item.itemId) {
      await NotificationService.resolveNotificationsForItem(familyId, item.itemId);
    }

    return {
      success: true,
      item,
    };
  }

  /**
   * Get a shopping list item by ID
   */
  static async getShoppingListItem(familyId: string, shoppingItemId: string): Promise<ShoppingListItem | null> {
    return await ShoppingListModel.getById(familyId, shoppingItemId);
  }

  /**
   * List shopping list items
   * Supports filtering by store and/or status
   */
  static async listShoppingListItems(
    familyId: string,
    filters?: {
      storeId?: string | null;
      status?: ShoppingListStatus;
    }
  ): Promise<ShoppingListItem[]> {
    if (filters?.storeId !== undefined && filters?.status) {
      // Filter by both store and status
      return await ShoppingListModel.listByStoreAndStatus(familyId, filters.storeId, filters.status);
    } else if (filters?.storeId !== undefined) {
      // Filter by store only
      return await ShoppingListModel.listByStore(familyId, filters.storeId);
    } else if (filters?.status) {
      // Filter by status only
      return await ShoppingListModel.listByStatus(familyId, filters.status);
    } else {
      // No filters - return all items
      return await ShoppingListModel.listByFamily(familyId);
    }
  }

  /**
   * Group shopping list items by store
   */
  static async groupByStore(
    familyId: string,
    status?: ShoppingListStatus
  ): Promise<Record<string, ShoppingListItem[]>> {
    const items = status
      ? await ShoppingListModel.listByStatus(familyId, status)
      : await ShoppingListModel.listByFamily(familyId);

    const grouped: Record<string, ShoppingListItem[]> = {};

    for (const item of items) {
      const storeKey = item.storeId || 'unassigned';
      if (!grouped[storeKey]) {
        grouped[storeKey] = [];
      }
      grouped[storeKey].push(item);
    }

    return grouped;
  }

  /**
   * Update shopping list item details (not status)
   * Uses optimistic locking
   */
  static async updateShoppingListItem(
    familyId: string,
    shoppingItemId: string,
    request: UpdateShoppingListItemRequest
  ): Promise<UpdateResult> {
    try {
      const item = await ShoppingListModel.update(familyId, shoppingItemId, request.version, {
        name: request.name,
        storeId: request.storeId,
        quantity: request.quantity,
        unit: request.unit,
        notes: request.notes,
      });

      logger.info('Updated shopping list item', {
        shoppingItemId,
        familyId,
        version: item.version,
      });

      return {
        success: true,
        item,
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'OPTIMISTIC_LOCK_CONFLICT') {
        // Get current item state
        const currentItem = await ShoppingListModel.getById(familyId, shoppingItemId);
        if (!currentItem) {
          throw new Error('Shopping list item not found');
        }

        logger.warn('Optimistic locking conflict on update', {
          shoppingItemId,
          familyId,
          expectedVersion: request.version,
          currentVersion: currentItem.version,
        });

        return {
          success: false,
          conflict: {
            currentItem,
            message: 'Item was modified by another user. Please refresh and try again.',
          },
        };
      }
      throw error;
    }
  }

  /**
   * Update shopping list item status (pending <-> purchased)
   * Uses optimistic locking
   * Manages TTL for purchased items
   */
  static async updateStatus(
    familyId: string,
    shoppingItemId: string,
    request: UpdateStatusRequest
  ): Promise<UpdateResult> {
    try {
      const item = await ShoppingListModel.updateStatus(familyId, shoppingItemId, request.version, request.status);

      logger.info('Updated shopping list item status', {
        shoppingItemId,
        familyId,
        status: request.status,
        version: item.version,
        ttl: item.ttl,
      });

      return {
        success: true,
        item,
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'OPTIMISTIC_LOCK_CONFLICT') {
        // Get current item state
        const currentItem = await ShoppingListModel.getById(familyId, shoppingItemId);
        if (!currentItem) {
          throw new Error('Shopping list item not found');
        }

        logger.warn('Optimistic locking conflict on status update', {
          shoppingItemId,
          familyId,
          expectedVersion: request.version,
          currentVersion: currentItem.version,
        });

        return {
          success: false,
          conflict: {
            currentItem,
            message: 'Item was modified by another user. Please refresh and try again.',
          },
        };
      }
      throw error;
    }
  }

  /**
   * Remove an item from the shopping list
   */
  static async removeFromShoppingList(familyId: string, shoppingItemId: string): Promise<void> {
    await ShoppingListModel.delete(familyId, shoppingItemId);

    logger.info('Removed item from shopping list', {
      shoppingItemId,
      familyId,
    });
  }

  /**
   * Handle inventory item deletion by converting linked shopping list items to free-text
   * This is called when an inventory item is deleted
   */
  static async handleInventoryItemDeleted(familyId: string, inventoryItemId: string): Promise<void> {
    await ShoppingListModel.convertToFreeText(familyId, inventoryItemId);

    logger.info('Handled inventory item deletion for shopping list', {
      familyId,
      inventoryItemId,
    });
  }
}
