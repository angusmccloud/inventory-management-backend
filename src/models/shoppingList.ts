/**
 * ShoppingListModel
 * Data access layer for shopping list items
 * Feature: 002-shopping-lists
 */

import { PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { docClient } from '../lib/dynamodb';
import { logger } from '../lib/logger';
import { v4 as uuidv4 } from 'uuid';
import {
  ShoppingListItem,
  ShoppingListStatus,
  ShoppingListKeyBuilder,
  calculateTTL,
  CreateShoppingListItemRequest,
} from '../types/shoppingList';

const TABLE_NAME = process.env['TABLE_NAME'] || '';

export class ShoppingListModel {
  /**
   * Create a new shopping list item
   */
  static async create(
    familyId: string,
    addedBy: string,
    data: CreateShoppingListItemRequest & { name: string; storeId?: string | null }
  ): Promise<ShoppingListItem> {
    const shoppingItemId = uuidv4();
    const now = new Date().toISOString();
    const status: ShoppingListStatus = 'pending';

    const keys = ShoppingListKeyBuilder.item(
      familyId,
      shoppingItemId,
      data.storeId || null,
      status
    );

    const item: ShoppingListItem = {
      ...keys,
      shoppingItemId,
      familyId,
      itemId: data.itemId || null,
      name: data.name,
      storeId: data.storeId || null,
      status,
      quantity: data.quantity || null,
      notes: data.notes || null,
      version: 1,
      ttl: null,
      addedBy,
      entityType: 'ShoppingListItem',
      createdAt: now,
      updatedAt: now,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      })
    );

    logger.info('Created shopping list item', {
      shoppingItemId,
      familyId,
      itemId: data.itemId,
    });

    return item;
  }

  /**
   * Get a shopping list item by ID
   */
  static async getById(familyId: string, shoppingItemId: string): Promise<ShoppingListItem | null> {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `FAMILY#${familyId}`,
          SK: `SHOPPING#${shoppingItemId}`,
        },
      })
    );

    return (result.Item as ShoppingListItem) || null;
  }

  /**
   * List all shopping list items for a family
   */
  static async listByFamily(familyId: string): Promise<ShoppingListItem[]> {
    const query = ShoppingListKeyBuilder.listAll(familyId);

    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        ...query,
      })
    );

    return (result.Items as ShoppingListItem[]) || [];
  }

  /**
   * List shopping list items by store
   */
  static async listByStore(familyId: string, storeId: string | null): Promise<ShoppingListItem[]> {
    const query = ShoppingListKeyBuilder.listByStore(familyId, storeId);

    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        ...query,
      })
    );

    return (result.Items as ShoppingListItem[]) || [];
  }

  /**
   * List shopping list items by status
   */
  static async listByStatus(familyId: string, status: ShoppingListStatus): Promise<ShoppingListItem[]> {
    const query = ShoppingListKeyBuilder.listByStatus(familyId, status);

    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        ...query,
      })
    );

    return (result.Items as ShoppingListItem[]) || [];
  }

  /**
   * List shopping list items by store and status
   */
  static async listByStoreAndStatus(
    familyId: string,
    storeId: string | null,
    status: ShoppingListStatus
  ): Promise<ShoppingListItem[]> {
    const query = ShoppingListKeyBuilder.listByStoreAndStatus(familyId, storeId, status);

    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        ...query,
      })
    );

    return (result.Items as ShoppingListItem[]) || [];
  }

  /**
   * Find duplicate shopping list item by inventory item ID
   * Returns the first pending item with the same itemId
   */
  static async findDuplicateByItemId(familyId: string, itemId: string): Promise<ShoppingListItem | null> {
    const query = ShoppingListKeyBuilder.findDuplicate(familyId, itemId);

    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        ...query,
      })
    );

    const items = result.Items as ShoppingListItem[] | undefined;
    return (items && items.length > 0 ? items[0] : null) as ShoppingListItem | null;
  }

  /**
   * Update shopping list item details (not status)
   * Uses optimistic locking with version check
   */
  static async update(
    familyId: string,
    shoppingItemId: string,
    expectedVersion: number,
    updates: {
      name?: string;
      storeId?: string | null;
      quantity?: number | null;
      notes?: string | null;
    }
  ): Promise<ShoppingListItem> {
    const now = new Date().toISOString();

    // Build update expression
    const updateParts: string[] = [];
    const expressionNames: Record<string, string> = {};
    const expressionValues: Record<string, any> = {
      ':one': 1,
      ':now': now,
      ':expectedVersion': expectedVersion,
    };

    if (updates.name !== undefined) {
      updateParts.push('#name = :name');
      expressionNames['#name'] = 'name';
      expressionValues[':name'] = updates.name;
    }

    if (updates.storeId !== undefined) {
      updateParts.push('storeId = :storeId');
      expressionValues[':storeId'] = updates.storeId;

      // Update GSI2SK if store changes
      updateParts.push('GSI2SK = :gsi2sk');
      // We need to get current status to build the GSI2SK
      const current = await this.getById(familyId, shoppingItemId);
      if (!current) {
        throw new Error('Shopping list item not found');
      }
      expressionValues[':gsi2sk'] = `STORE#${updates.storeId || 'UNASSIGNED'}#STATUS#${current.status}`;
    }

    if (updates.quantity !== undefined) {
      updateParts.push('quantity = :quantity');
      expressionValues[':quantity'] = updates.quantity;
    }

    if (updates.notes !== undefined) {
      updateParts.push('notes = :notes');
      expressionValues[':notes'] = updates.notes;
    }

    // Always update version and updatedAt
    updateParts.push('version = version + :one', 'updatedAt = :now');

    const updateExpression = `SET ${updateParts.join(', ')}`;

    try {
      const result = await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `FAMILY#${familyId}`,
            SK: `SHOPPING#${shoppingItemId}`,
          },
          UpdateExpression: updateExpression,
          ConditionExpression: 'version = :expectedVersion',
          ExpressionAttributeNames: Object.keys(expressionNames).length > 0 ? expressionNames : undefined,
          ExpressionAttributeValues: expressionValues,
          ReturnValues: 'ALL_NEW',
        })
      );

      logger.info('Updated shopping list item', {
        shoppingItemId,
        familyId,
        version: expectedVersion + 1,
      });

      return result.Attributes as ShoppingListItem;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        logger.warn('Optimistic locking conflict on shopping list item update', {
          shoppingItemId,
          familyId,
          expectedVersion,
        });
        throw new Error('OPTIMISTIC_LOCK_CONFLICT');
      }
      throw error;
    }
  }

  /**
   * Update shopping list item status (pending <-> purchased)
   * Uses optimistic locking with version check
   * Manages TTL based on status
   */
  static async updateStatus(
    familyId: string,
    shoppingItemId: string,
    expectedVersion: number,
    newStatus: ShoppingListStatus
  ): Promise<ShoppingListItem> {
    const now = new Date().toISOString();

    // Get current item to build new GSI2SK
    const current = await this.getById(familyId, shoppingItemId);
    if (!current) {
      throw new Error('Shopping list item not found');
    }

    // Calculate TTL based on status
    const ttl = newStatus === 'purchased' ? calculateTTL() : null;

    // Build new GSI2SK
    const gsi2sk = `STORE#${current.storeId || 'UNASSIGNED'}#STATUS#${newStatus}`;

    try {
      const result = await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `FAMILY#${familyId}`,
            SK: `SHOPPING#${shoppingItemId}`,
          },
          UpdateExpression:
            'SET #status = :status, version = version + :one, updatedAt = :now, #ttl = :ttl, GSI2SK = :gsi2sk',
          ConditionExpression: 'version = :expectedVersion',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#ttl': 'ttl',
          },
          ExpressionAttributeValues: {
            ':status': newStatus,
            ':one': 1,
            ':now': now,
            ':ttl': ttl,
            ':gsi2sk': gsi2sk,
            ':expectedVersion': expectedVersion,
          },
          ReturnValues: 'ALL_NEW',
        })
      );

      logger.info('Updated shopping list item status', {
        shoppingItemId,
        familyId,
        newStatus,
        ttl,
        version: expectedVersion + 1,
      });

      return result.Attributes as ShoppingListItem;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        logger.warn('Optimistic locking conflict on shopping list item status update', {
          shoppingItemId,
          familyId,
          expectedVersion,
        });
        throw new Error('OPTIMISTIC_LOCK_CONFLICT');
      }
      throw error;
    }
  }

  /**
   * Delete a shopping list item
   */
  static async delete(familyId: string, shoppingItemId: string): Promise<void> {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `FAMILY#${familyId}`,
          SK: `SHOPPING#${shoppingItemId}`,
        },
      })
    );

    logger.info('Deleted shopping list item', {
      shoppingItemId,
      familyId,
    });
  }

  /**
   * Convert shopping list items to free-text when inventory item is deleted
   * Sets itemId to null while preserving all other attributes
   */
  static async convertToFreeText(familyId: string, inventoryItemId: string): Promise<void> {
    // Find all shopping items linked to this inventory item
    const allItems = await this.listByFamily(familyId);
    const linkedItems = allItems.filter((item) => item.itemId === inventoryItemId);

    if (linkedItems.length === 0) {
      return;
    }

    // Update each item to set itemId = null
    const updatePromises = linkedItems.map(async (item) => {
      const now = new Date().toISOString();
      
      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `FAMILY#${familyId}`,
            SK: `SHOPPING#${item.shoppingItemId}`,
          },
          UpdateExpression: 'SET itemId = :null, version = version + :one, updatedAt = :now',
          ExpressionAttributeValues: {
            ':null': null,
            ':one': 1,
            ':now': now,
          },
        })
      );
    });

    await Promise.all(updatePromises);

    logger.info('Converted shopping list items to free-text', {
      familyId,
      inventoryItemId,
      count: linkedItems.length,
    });
  }
}

