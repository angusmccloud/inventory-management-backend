import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { logger } from '../lib/logger';
import { generateUUID } from '../lib/uuid';
import { Store, StoreInput, KeyBuilder } from '../types/entities';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env['TABLE_NAME'] || 'InventoryManagement';

/**
 * Store Model
 * Handles DynamoDB operations for Store entities
 */
export class StoreModel {
  /**
   * Create a new store
   */
  static async create(input: StoreInput): Promise<Store> {
    const storeId = generateUUID();
    const now = new Date().toISOString();

    const keys = KeyBuilder.store(input.familyId, storeId);

    const store: Store = {
      ...keys,
      storeId,
      familyId: input.familyId,
      name: input.name,
      address: input.address,
      notes: input.notes,
      entityType: 'Store',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: store,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );

      logger.info('Store created', { storeId, familyId: input.familyId, name: store.name });
      return store;
    } catch (error) {
      logger.error('Failed to create store', error as Error, { input });
      throw error;
    }
  }

  /**
   * Get store by ID
   */
  static async getById(familyId: string, storeId: string): Promise<Store | null> {
    try {
      const keys = KeyBuilder.store(familyId, storeId);
      const result = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: keys,
        })
      );

      if (!result.Item) {
        return null;
      }

      return result.Item as Store;
    } catch (error) {
      logger.error('Failed to get store', error as Error, { familyId, storeId });
      throw error;
    }
  }

  /**
   * List all stores for a family
   */
  static async listByFamily(familyId: string): Promise<Store[]> {
    try {
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `FAMILY#${familyId}`,
            ':sk': 'STORE#',
          },
        })
      );

      return (result.Items || []) as Store[];
    } catch (error) {
      logger.error('Failed to list stores', error as Error, { familyId });
      throw error;
    }
  }

  /**
   * Update store
   */
  static async update(
    familyId: string,
    storeId: string,
    updates: Partial<Pick<Store, 'name' | 'address' | 'notes'>>
  ): Promise<Store> {
    const now = new Date().toISOString();

    try {
      const updateExpression: string[] = ['#updatedAt = :updatedAt'];
      const expressionAttributeNames: Record<string, string> = { '#updatedAt': 'updatedAt' };
      const expressionAttributeValues: Record<string, unknown> = { ':updatedAt': now };

      if (updates.name !== undefined) {
        updateExpression.push('#name = :name');
        expressionAttributeNames['#name'] = 'name';
        expressionAttributeValues[':name'] = updates.name;
      }

      if (updates.address !== undefined) {
        updateExpression.push('#address = :address');
        expressionAttributeNames['#address'] = 'address';
        expressionAttributeValues[':address'] = updates.address;
      }

      if (updates.notes !== undefined) {
        updateExpression.push('#notes = :notes');
        expressionAttributeNames['#notes'] = 'notes';
        expressionAttributeValues[':notes'] = updates.notes;
      }

      const keys = KeyBuilder.store(familyId, storeId);
      const result = await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: keys,
          UpdateExpression: `SET ${updateExpression.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ConditionExpression: 'attribute_exists(PK)',
          ReturnValues: 'ALL_NEW',
        })
      );

      if (!result.Attributes) {
        throw new Error('Store not found');
      }

      logger.info('Store updated', { familyId, storeId, updates });
      return result.Attributes as Store;
    } catch (error) {
      logger.error('Failed to update store', error as Error, { familyId, storeId, updates });
      throw error;
    }
  }

  /**
   * Delete store
   */
  static async delete(familyId: string, storeId: string): Promise<void> {
    try {
      const keys = KeyBuilder.store(familyId, storeId);
      await docClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: keys,
          ConditionExpression: 'attribute_exists(PK)',
        })
      );

      logger.info('Store deleted', { familyId, storeId });
    } catch (error) {
      logger.error('Failed to delete store', error as Error, { familyId, storeId });
      throw error;
    }
  }
}
