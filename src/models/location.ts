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
import { StorageLocation, StorageLocationInput, KeyBuilder } from '../types/entities';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env['TABLE_NAME'] || 'InventoryManagement';

/**
 * StorageLocation Model
 * Handles DynamoDB operations for StorageLocation entities
 */
export class StorageLocationModel {
  /**
   * Create a new storage location
   */
  static async create(input: StorageLocationInput): Promise<StorageLocation> {
    const locationId = generateUUID();
    const now = new Date().toISOString();

    const keys = KeyBuilder.storageLocation(input.familyId, locationId);

    const location: StorageLocation = {
      ...keys,
      locationId,
      familyId: input.familyId,
      name: input.name,
      description: input.description,
      entityType: 'StorageLocation',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: location,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );

      logger.info('Storage location created', { locationId, familyId: input.familyId, name: location.name });
      return location;
    } catch (error) {
      logger.error('Failed to create storage location', error as Error, { input });
      throw error;
    }
  }

  /**
   * Get storage location by ID
   */
  static async getById(familyId: string, locationId: string): Promise<StorageLocation | null> {
    try {
      const keys = KeyBuilder.storageLocation(familyId, locationId);
      const result = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: keys,
        })
      );

      if (!result.Item) {
        return null;
      }

      return result.Item as StorageLocation;
    } catch (error) {
      logger.error('Failed to get storage location', error as Error, { familyId, locationId });
      throw error;
    }
  }

  /**
   * List all storage locations for a family
   */
  static async listByFamily(familyId: string): Promise<StorageLocation[]> {
    try {
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `FAMILY#${familyId}`,
            ':sk': 'LOCATION#',
          },
        })
      );

      return (result.Items || []) as StorageLocation[];
    } catch (error) {
      logger.error('Failed to list storage locations', error as Error, { familyId });
      throw error;
    }
  }

  /**
   * Update storage location
   */
  static async update(
    familyId: string,
    locationId: string,
    updates: Partial<Pick<StorageLocation, 'name' | 'description'>>
  ): Promise<StorageLocation> {
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

      if (updates.description !== undefined) {
        updateExpression.push('#description = :description');
        expressionAttributeNames['#description'] = 'description';
        expressionAttributeValues[':description'] = updates.description;
      }

      const keys = KeyBuilder.storageLocation(familyId, locationId);
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
        throw new Error('Storage location not found');
      }

      logger.info('Storage location updated', { familyId, locationId, updates });
      return result.Attributes as StorageLocation;
    } catch (error) {
      logger.error('Failed to update storage location', error as Error, { familyId, locationId, updates });
      throw error;
    }
  }

  /**
   * Delete storage location
   */
  static async delete(familyId: string, locationId: string): Promise<void> {
    try {
      const keys = KeyBuilder.storageLocation(familyId, locationId);
      await docClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: keys,
          ConditionExpression: 'attribute_exists(PK)',
        })
      );

      logger.info('Storage location deleted', { familyId, locationId });
    } catch (error) {
      logger.error('Failed to delete storage location', error as Error, { familyId, locationId });
      throw error;
    }
  }
}
