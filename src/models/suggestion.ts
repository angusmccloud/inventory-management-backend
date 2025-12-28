import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient, getTableName } from '../lib/dynamodb';
import { logger } from '../lib/logger';
import { generateUUID } from '../lib/uuid';
import { Suggestion, KeyBuilder, SuggestionStatus, SuggestionType } from '../types/entities';

const TABLE_NAME = getTableName();

/**
 * Input for creating a suggestion
 */
export interface CreateSuggestionInput {
  familyId: string;
  suggestedBy: string;
  suggestedByName: string;
  type: SuggestionType;
  itemId?: string;
  itemNameSnapshot?: string;
  proposedItemName?: string;
  proposedQuantity?: number;
  proposedThreshold?: number;
  notes?: string | null;
}

/**
 * Query options for listing suggestions
 */
export interface ListSuggestionsOptions {
  status?: SuggestionStatus;
  limit?: number;
  nextToken?: string;
}

/**
 * Decoded pagination token
 */
interface PaginationToken {
  status: SuggestionStatus | 'all';
  lastCreatedAt: string;
  lastSuggestionId: string;
}

/**
 * Suggestion Model
 * Handles DynamoDB operations for Suggestion entities
 */
export class SuggestionModel {
  /**
   * Create a new suggestion
   */
  static async create(input: CreateSuggestionInput): Promise<Suggestion> {
    const suggestionId = generateUUID();
    const now = new Date().toISOString();

    const keys = KeyBuilder.suggestion(input.familyId, suggestionId, 'pending', now);

    const suggestion: Suggestion = {
      ...keys,
      suggestionId,
      familyId: input.familyId,
      suggestedBy: input.suggestedBy,
      suggestedByName: input.suggestedByName,
      type: input.type,
      status: 'pending',
      itemId: input.itemId || null,
      itemNameSnapshot: input.itemNameSnapshot || null,
      proposedItemName: input.proposedItemName || null,
      proposedQuantity: input.proposedQuantity || null,
      proposedThreshold: input.proposedThreshold || null,
      notes: input.notes || null,
      rejectionNotes: null,
      reviewedBy: null,
      reviewedAt: null,
      version: 1,
      entityType: 'Suggestion',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: suggestion,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );

      logger.info('Suggestion created', { 
        suggestionId, 
        familyId: input.familyId, 
        type: input.type 
      });
      return suggestion;
    } catch (error) {
      logger.error('Failed to create suggestion', error as Error, { input });
      throw error;
    }
  }

  /**
   * Get suggestion by ID
   */
  static async getById(familyId: string, suggestionId: string): Promise<Suggestion | null> {
    try {
      const result = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `FAMILY#${familyId}`,
            SK: `SUGGESTION#${suggestionId}`,
          },
        })
      );

      if (!result.Item) {
        return null;
      }

      return result.Item as Suggestion;
    } catch (error) {
      logger.error('Failed to get suggestion', error as Error, { familyId, suggestionId });
      throw error;
    }
  }

  /**
   * List suggestions for a family with optional filtering and pagination
   */
  static async listByFamily(
    familyId: string,
    options: ListSuggestionsOptions = {}
  ): Promise<{ suggestions: Suggestion[]; nextToken?: string }> {
    try {
      const limit = options.limit || 20;
      let exclusiveStartKey: Record<string, string> | undefined;

      // Decode next token if provided
      if (options.nextToken) {
        try {
          const decoded = JSON.parse(
            Buffer.from(options.nextToken, 'base64').toString('utf-8')
          ) as PaginationToken;
          exclusiveStartKey = {
            PK: `FAMILY#${familyId}`,
            SK: `SUGGESTION#${decoded.lastSuggestionId}`,
            GSI2PK: `FAMILY#${familyId}#SUGGESTIONS`,
            GSI2SK: `STATUS#${decoded.status}#CREATED#${decoded.lastCreatedAt}`,
          };
        } catch (err) {
          logger.warn('Invalid pagination token', { token: options.nextToken });
          throw new Error('Invalid pagination token');
        }
      }

      let result;
      
      if (options.status) {
        // Query by status using GSI2
        result = await docClient.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: 'GSI2',
            KeyConditionExpression: 'GSI2PK = :gsi2pk AND begins_with(GSI2SK, :gsi2sk)',
            ExpressionAttributeValues: {
              ':gsi2pk': `FAMILY#${familyId}#SUGGESTIONS`,
              ':gsi2sk': `STATUS#${options.status}#`,
            },
            Limit: limit,
            ExclusiveStartKey: exclusiveStartKey,
            ScanIndexForward: false, // Most recent first
          })
        );
      } else {
        // Query all suggestions for family
        result = await docClient.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
              ':pk': `FAMILY#${familyId}`,
              ':sk': 'SUGGESTION#',
            },
            Limit: limit,
            ExclusiveStartKey: exclusiveStartKey,
            ScanIndexForward: false,
          })
        );
      }

      const suggestions = (result.Items || []) as Suggestion[];

      // Generate next token if there are more results
      let nextToken: string | undefined;
      if (result.LastEvaluatedKey && suggestions.length > 0) {
        const last = suggestions[suggestions.length - 1];
        if (last) {
          const token: PaginationToken = {
            status: options.status || 'all',
            lastCreatedAt: last.createdAt,
            lastSuggestionId: last.suggestionId,
          };
          nextToken = Buffer.from(JSON.stringify(token)).toString('base64');
        }
      }

      return { suggestions, nextToken };
    } catch (error) {
      logger.error('Failed to list suggestions', error as Error, { familyId, options });
      throw error;
    }
  }

  /**
   * Update suggestion status (for approval/rejection)
   * Uses optimistic locking with version check
   */
  static async updateStatus(
    familyId: string,
    suggestionId: string,
    status: 'approved' | 'rejected',
    reviewedBy: string,
    currentVersion: number,
    rejectionNotes?: string | null
  ): Promise<Suggestion> {
    const now = new Date().toISOString();
    const newVersion = currentVersion + 1;

    try {
      // First get the current suggestion to get its createdAt for GSI2SK update
      const current = await this.getById(familyId, suggestionId);
      if (!current) {
        throw new Error('Suggestion not found');
      }

      const newKeys = KeyBuilder.suggestion(familyId, suggestionId, status, current.createdAt);

      const result = await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `FAMILY#${familyId}`,
            SK: `SUGGESTION#${suggestionId}`,
          },
          UpdateExpression:
            'SET #status = :status, reviewedBy = :reviewedBy, reviewedAt = :reviewedAt, ' +
            '#version = :newVersion, updatedAt = :updatedAt, GSI2SK = :gsi2sk' +
            (rejectionNotes !== undefined ? ', rejectionNotes = :rejectionNotes' : ''),
          ConditionExpression: '#status = :pendingStatus AND #version = :currentVersion',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#version': 'version',
          },
          ExpressionAttributeValues: {
            ':status': status,
            ':reviewedBy': reviewedBy,
            ':reviewedAt': now,
            ':newVersion': newVersion,
            ':updatedAt': now,
            ':pendingStatus': 'pending',
            ':currentVersion': currentVersion,
            ':gsi2sk': newKeys.GSI2SK,
            ...(rejectionNotes !== undefined && { ':rejectionNotes': rejectionNotes }),
          },
          ReturnValues: 'ALL_NEW',
        })
      );

      logger.info('Suggestion status updated', {
        suggestionId,
        familyId,
        status,
        reviewedBy,
      });

      return result.Attributes as Suggestion;
    } catch (error) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
        logger.warn('Suggestion update failed - version mismatch or not pending', {
          suggestionId,
          familyId,
          expectedVersion: currentVersion,
        });
        throw new Error('Suggestion has already been reviewed or version mismatch');
      }
      logger.error('Failed to update suggestion status', error as Error, {
        familyId,
        suggestionId,
        status,
      });
      throw error;
    }
  }
}
