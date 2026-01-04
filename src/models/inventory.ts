import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient, getTableName } from '../lib/dynamodb';
import { logger } from '../lib/logger';
import { generateUUID } from '../lib/uuid';
import { InventoryItem, InventoryItemInput, KeyBuilder, QueryPatterns } from '../types/entities';

const TABLE_NAME = getTableName();

/**
 * InventoryItem Model
 * Handles DynamoDB operations for InventoryItem entities
 */
export class InventoryItemModel {
  /**
   * Create a new inventory item
   */
  static async create(input: InventoryItemInput): Promise<InventoryItem> {
    const itemId = generateUUID();
    const now = new Date().toISOString();

    const keys = KeyBuilder.inventoryItem(input.familyId, itemId, 'active', input.quantity);

    const item: InventoryItem = {
      ...keys,
      itemId,
      familyId: input.familyId,
      name: input.name,
      quantity: input.quantity,
      unit: input.unit,
      locationId: input.locationId,
      locationName: input.locationName,
      preferredStoreId: input.preferredStoreId,
      preferredStoreName: input.preferredStoreName,
      lowStockThreshold: input.lowStockThreshold,
      status: 'active',
      notes: input.notes,
      createdBy: input.createdBy,
      lastModifiedBy: input.createdBy,
      entityType: 'InventoryItem',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: item,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );

      logger.info('Inventory item created', { itemId, familyId: input.familyId, name: item.name });
      return item;
    } catch (error) {
      logger.error('Failed to create inventory item', error as Error, { input });
      throw error;
    }
  }

  /**
   * Get inventory item by ID
   */
  static async getById(familyId: string, itemId: string): Promise<InventoryItem | null> {
    try {
      const result = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `FAMILY#${familyId}`,
            SK: `ITEM#${itemId}`,
          },
        })
      );

      if (!result.Item) {
        return null;
      }

      return result.Item as InventoryItem;
    } catch (error) {
      logger.error('Failed to get inventory item', error as Error, { familyId, itemId });
      throw error;
    }
  }

  /**
   * List all inventory items for a family
   */
  static async listByFamily(familyId: string, includeArchived = false): Promise<InventoryItem[]> {
    try {
      const queryParams = QueryPatterns.listInventoryItems(familyId);
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          ...queryParams,
          FilterExpression: includeArchived ? undefined : '#status = :status',
          ExpressionAttributeNames: includeArchived ? undefined : { '#status': 'status' },
          ExpressionAttributeValues: includeArchived 
            ? queryParams.ExpressionAttributeValues 
            : { ...queryParams.ExpressionAttributeValues, ':status': 'active' },
        })
      );

      return (result.Items || []) as InventoryItem[];
    } catch (error) {
      logger.error('Failed to list inventory items', error as Error, { familyId });
      throw error;
    }
  }

  /**
   * Query low-stock items for a family
   */
  static async queryLowStock(familyId: string): Promise<InventoryItem[]> {
    try {
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'GSI2',
          KeyConditionExpression: 'GSI2PK = :gsi2pk AND begins_with(GSI2SK, :gsi2sk)',
          ExpressionAttributeValues: {
            ':gsi2pk': `FAMILY#${familyId}#ITEMS`,
            ':gsi2sk': 'STATUS#active#',
          },
        })
      );

      const items = (result.Items || []) as InventoryItem[];
      
      // Filter items where quantity is less than or equal to the threshold
      return items.filter((item) => item.quantity <= item.lowStockThreshold);
    } catch (error) {
      logger.error('Failed to query low-stock items', error as Error, { familyId });
      throw error;
    }
  }

  /**
   * Update inventory item
   */
  static async update(
    familyId: string,
    itemId: string,
    updates: Partial<Omit<InventoryItem, 'itemId' | 'familyId' | 'createdBy' | 'entityType' | 'createdAt' | 'PK' | 'SK'>>,
    modifiedBy: string
  ): Promise<InventoryItem> {
    const now = new Date().toISOString();

    try {
      // Get current item to calculate new GSI2SK if needed
      const currentItem = await this.getById(familyId, itemId);
      if (!currentItem) {
        throw new Error('Item not found');
      }

      const updateExpression: string[] = ['#updatedAt = :updatedAt', '#lastModifiedBy = :lastModifiedBy'];
      const expressionAttributeNames: Record<string, string> = { 
        '#updatedAt': 'updatedAt',
        '#lastModifiedBy': 'lastModifiedBy',
      };
      const expressionAttributeValues: Record<string, unknown> = { 
        ':updatedAt': now,
        ':lastModifiedBy': modifiedBy,
      };

      const fieldsToUpdate = ['name', 'quantity', 'unit', 'locationId', 'locationName', 
                              'preferredStoreId', 'preferredStoreName', 'lowStockThreshold', 
                              'status', 'notes'] as const;

      fieldsToUpdate.forEach((field) => {
        if (updates[field] !== undefined) {
          updateExpression.push(`#${field} = :${field}`);
          expressionAttributeNames[`#${field}`] = field;
          expressionAttributeValues[`:${field}`] = updates[field];
        }
      });

      // Update GSI2SK if quantity or status changed
      const newQuantity = updates.quantity !== undefined ? updates.quantity : currentItem.quantity;
      const newStatus = updates.status !== undefined ? updates.status : currentItem.status;
      
      if (updates.quantity !== undefined || updates.status !== undefined) {
        const newGSI2SK = `STATUS#${newStatus}#QUANTITY#${String(newQuantity).padStart(10, '0')}`;
        updateExpression.push('#GSI2SK = :GSI2SK');
        expressionAttributeNames['#GSI2SK'] = 'GSI2SK';
        expressionAttributeValues[':GSI2SK'] = newGSI2SK;
      }

      const result = await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `FAMILY#${familyId}`,
            SK: `ITEM#${itemId}`,
          },
          UpdateExpression: `SET ${updateExpression.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ConditionExpression: 'attribute_exists(PK)',
          ReturnValues: 'ALL_NEW',
        })
      );

      if (!result.Attributes) {
        throw new Error('Item not found');
      }

      logger.info('Inventory item updated', { familyId, itemId, updates });
      return result.Attributes as InventoryItem;
    } catch (error) {
      logger.error('Failed to update inventory item', error as Error, { familyId, itemId, updates });
      throw error;
    }
  }

  /**
   * Adjust item quantity (increment or decrement)
   */
  static async adjustQuantity(
    familyId: string,
    itemId: string,
    delta: number,
    modifiedBy: string
  ): Promise<InventoryItem> {
    try {
      const currentItem = await this.getById(familyId, itemId);
      if (!currentItem) {
        throw new Error('Item not found');
      }

      const newQuantity = Math.max(0, currentItem.quantity + delta);
      return await this.update(familyId, itemId, { quantity: newQuantity }, modifiedBy);
    } catch (error) {
      logger.error('Failed to adjust inventory quantity', error as Error, { familyId, itemId, delta });
      throw error;
    }
  }

  /**
   * Archive item (soft delete)
   */
  static async archive(familyId: string, itemId: string, modifiedBy: string): Promise<InventoryItem> {
    try {
      return await this.update(familyId, itemId, { status: 'archived' }, modifiedBy);
    } catch (error) {
      logger.error('Failed to archive inventory item', error as Error, { familyId, itemId });
      throw error;
    }
  }

  /**
   * Check if item is below threshold (low stock)
   */
  static isLowStock(item: InventoryItem): boolean {
    return item.quantity <= item.lowStockThreshold && item.status === 'active';
  }
}
