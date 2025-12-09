import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { logger } from '../lib/logger';
import { generateUUID } from '../lib/uuid';
import { Family, FamilyInput, KeyBuilder } from '../types/entities';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env['TABLE_NAME'] || 'InventoryManagement';

/**
 * Family Model
 * Handles DynamoDB operations for Family entities
 */
export class FamilyModel {
  /**
   * Create a new family
   */
  static async create(input: FamilyInput): Promise<Family> {
    const familyId = generateUUID();
    const now = new Date().toISOString();

    const keys = KeyBuilder.family(familyId);

    const family: Family = {
      ...keys,
      familyId,
      name: input.name,
      createdBy: input.createdBy,
      entityType: 'Family',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: family,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );

      logger.info('Family created', { familyId, name: family.name });
      return family;
    } catch (error) {
      logger.error('Failed to create family', error as Error, { input });
      throw error;
    }
  }

  /**
   * Get family by ID
   */
  static async getById(familyId: string): Promise<Family | null> {
    try {
      const keys = KeyBuilder.family(familyId);
      const result = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: keys,
        })
      );

      if (!result.Item) {
        return null;
      }

      return result.Item as Family;
    } catch (error) {
      logger.error('Failed to get family', error as Error, { familyId });
      throw error;
    }
  }

  /**
   * Update family
   */
  static async update(
    familyId: string,
    updates: Partial<Omit<Family, 'familyId' | 'createdBy' | 'entityType' | 'createdAt' | 'PK' | 'SK'>>
  ): Promise<Family> {
    const now = new Date().toISOString();

    try {
      const updateExpression: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, unknown> = {};

      // Add updatedAt
      updateExpression.push('#updatedAt = :updatedAt');
      expressionAttributeNames['#updatedAt'] = 'updatedAt';
      expressionAttributeValues[':updatedAt'] = now;

      // Add other updates
      if (updates.name !== undefined) {
        updateExpression.push('#name = :name');
        expressionAttributeNames['#name'] = 'name';
        expressionAttributeValues[':name'] = updates.name;
      }

      const keys = KeyBuilder.family(familyId);
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
        throw new Error('Family not found');
      }

      logger.info('Family updated', { familyId, updates });
      return result.Attributes as Family;
    } catch (error) {
      logger.error('Failed to update family', error as Error, { familyId, updates });
      throw error;
    }
  }

  /**
   * Delete family (soft delete by archiving all related data)
   */
  static async delete(familyId: string): Promise<void> {
    try {
      const keys = KeyBuilder.family(familyId);
      await docClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: keys,
          ConditionExpression: 'attribute_exists(PK)',
        })
      );

      logger.info('Family deleted', { familyId });
    } catch (error) {
      logger.error('Failed to delete family', error as Error, { familyId });
      throw error;
    }
  }
}
