import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient, getTableName } from '../lib/dynamodb';
import { logger } from '../lib/logger';
import { generateUUID } from '../lib/uuid';
import { Family, FamilyInput, KeyBuilder } from '../types/entities';

const TABLE_NAME = getTableName();

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
          Key: { PK: keys.PK, SK: keys.SK },
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
   * List all families using the family index (GSI1)
   */
  static async listAll(): Promise<Family[]> {
    try {
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :gsi1pk',
          ExpressionAttributeValues: {
            ':gsi1pk': 'FAMILY',
          },
        })
      );

      return (result.Items || []) as Family[];
    } catch (error) {
      logger.error('Failed to list families', error as Error);
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
          Key: { PK: keys.PK, SK: keys.SK },
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
          Key: { PK: keys.PK, SK: keys.SK },
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
