/**
 * NFCUrl Model
 * 
 * @description Handles DynamoDB operations for NFCUrl entities.
 * NFCUrl maps cryptographically random URL IDs to inventory items,
 * enabling unauthenticated adjustments via NFC tag taps.
 * 
 * @see specs/006-api-integration/data-model.md for schema design
 */

import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient, getTableName } from '../lib/dynamodb';
import { logger } from '../lib/logger';
import { generateUrlId } from '../lib/urlGenerator';
import {
  NFCUrl,
  CreateNFCUrlInput,
} from '../types/nfcUrl';

const TABLE_NAME = getTableName();

/**
 * NFCUrl Model
 * Handles DynamoDB operations for NFCUrl entities
 */
export class NFCUrlModel {
  /**
   * Create a new NFC URL for an inventory item
   * 
   * @param input - Create NFC URL input with itemId, familyId, itemName, createdBy
   * @returns Created NFCUrl entity
   */
  static async create(input: CreateNFCUrlInput): Promise<NFCUrl> {
    const urlId = generateUrlId();
    const now = new Date().toISOString();

    const nfcUrl: NFCUrl = {
      // Main table keys
      PK: `FAMILY#${input.familyId}`,
      SK: `ITEM#${input.itemId}#URL#${urlId}`,
      
      // GSI1 keys (URL lookup)
      GSI1PK: `URL#${urlId}`,
      GSI1SK: `ITEM#${input.itemId}`,
      
      // GSI2 keys (family URL list)
      GSI2PK: `FAMILY#${input.familyId}#URLS`,
      GSI2SK: `CREATED#${now}#URL#${urlId}`,
      
      // Entity data
      entityType: 'NFCUrl',
      urlId,
      itemId: input.itemId,
      familyId: input.familyId,
      itemName: input.itemName,
      isActive: true,
      createdAt: now,
      createdBy: input.createdBy,
      accessCount: 0,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: nfcUrl,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );

      logger.info('NFC URL created', { 
        urlId, 
        itemId: input.itemId, 
        familyId: input.familyId 
      });
      
      return nfcUrl;
    } catch (error) {
      logger.error('Failed to create NFC URL', error as Error, { input });
      throw error;
    }
  }

  /**
   * Get NFC URL by urlId (uses GSI1 for fast lookup)
   * 
   * @param urlId - Base62-encoded URL ID (22 characters)
   * @returns NFCUrl entity or null if not found
   */
  static async getByUrlId(urlId: string): Promise<NFCUrl | null> {
    try {
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :gsi1pk',
          ExpressionAttributeValues: {
            ':gsi1pk': `URL#${urlId}`,
          },
          Limit: 1,
        })
      );

      if (!result.Items || result.Items.length === 0) {
        return null;
      }

      return result.Items[0] as NFCUrl;
    } catch (error) {
      logger.error('Failed to get NFC URL by urlId', error as Error, { urlId });
      throw error;
    }
  }

  /**
   * Get NFC URL by composite key (familyId, itemId, urlId)
   * 
   * @param familyId - Family UUID
   * @param itemId - Item UUID
   * @param urlId - URL ID
   * @returns NFCUrl entity or null if not found
   */
  static async getByCompositeKey(
    familyId: string,
    itemId: string,
    urlId: string
  ): Promise<NFCUrl | null> {
    try {
      const result = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `FAMILY#${familyId}`,
            SK: `ITEM#${itemId}#URL#${urlId}`,
          },
        })
      );

      if (!result.Item) {
        return null;
      }

      return result.Item as NFCUrl;
    } catch (error) {
      logger.error('Failed to get NFC URL by composite key', error as Error, { 
        familyId, 
        itemId, 
        urlId 
      });
      throw error;
    }
  }

  /**
   * List all NFC URLs for an inventory item
   * 
   * @param familyId - Family UUID
   * @param itemId - Item UUID
   * @param includeInactive - Include deactivated URLs (default: false)
   * @returns Array of NFCUrl entities
   */
  static async listByItem(
    familyId: string,
    itemId: string,
    includeInactive = false
  ): Promise<NFCUrl[]> {
    try {
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `FAMILY#${familyId}`,
            ':sk': `ITEM#${itemId}#URL#`,
          },
        })
      );

      let items = (result.Items || []) as NFCUrl[];
      
      // Filter inactive URLs if requested
      if (!includeInactive) {
        items = items.filter(url => url.isActive);
      }

      return items;
    } catch (error) {
      logger.error('Failed to list NFC URLs for item', error as Error, { 
        familyId, 
        itemId 
      });
      throw error;
    }
  }

  /**
   * List all NFC URLs for a family (uses GSI2)
   * 
   * @param familyId - Family UUID
   * @param includeInactive - Include deactivated URLs (default: false)
   * @returns Array of NFCUrl entities sorted by createdAt
   */
  static async listByFamily(
    familyId: string,
    includeInactive = false
  ): Promise<NFCUrl[]> {
    try {
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'GSI2',
          KeyConditionExpression: 'GSI2PK = :gsi2pk',
          ExpressionAttributeValues: {
            ':gsi2pk': `FAMILY#${familyId}#URLS`,
          },
        })
      );

      let items = (result.Items || []) as NFCUrl[];
      
      // Filter inactive URLs if requested
      if (!includeInactive) {
        items = items.filter(url => url.isActive);
      }

      return items;
    } catch (error) {
      logger.error('Failed to list NFC URLs for family', error as Error, { 
        familyId 
      });
      throw error;
    }
  }

  /**
   * Deactivate an NFC URL (used during rotation)
   * 
   * @param familyId - Family UUID
   * @param itemId - Item UUID
   * @param urlId - URL ID to deactivate
   * @param rotatedBy - Member ID who rotated the URL
   * @returns Updated NFCUrl entity
   */
  static async deactivate(
    familyId: string,
    itemId: string,
    urlId: string,
    rotatedBy: string
  ): Promise<NFCUrl> {
    const now = new Date().toISOString();

    try {
      const result = await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `FAMILY#${familyId}`,
            SK: `ITEM#${itemId}#URL#${urlId}`,
          },
          UpdateExpression: 'SET isActive = :isActive, rotatedAt = :rotatedAt, rotatedBy = :rotatedBy',
          ExpressionAttributeValues: {
            ':isActive': false,
            ':rotatedAt': now,
            ':rotatedBy': rotatedBy,
          },
          ConditionExpression: 'attribute_exists(PK)',
          ReturnValues: 'ALL_NEW',
        })
      );

      logger.info('NFC URL deactivated', { urlId, familyId, itemId });
      
      return result.Attributes as NFCUrl;
    } catch (error) {
      logger.error('Failed to deactivate NFC URL', error as Error, { 
        familyId, 
        itemId, 
        urlId 
      });
      throw error;
    }
  }

  /**
   * Increment access count for an NFC URL (atomic operation)
   * 
   * @param familyId - Family UUID
   * @param itemId - Item UUID
   * @param urlId - URL ID
   * @returns Updated access count
   */
  static async incrementAccessCount(
    familyId: string,
    itemId: string,
    urlId: string
  ): Promise<number> {
    const now = new Date().toISOString();

    try {
      const result = await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `FAMILY#${familyId}`,
            SK: `ITEM#${itemId}#URL#${urlId}`,
          },
          UpdateExpression: 'SET accessCount = if_not_exists(accessCount, :zero) + :inc, lastAccessedAt = :now',
          ExpressionAttributeValues: {
            ':zero': 0,
            ':inc': 1,
            ':now': now,
          },
          ReturnValues: 'ALL_NEW',
        })
      );

      const updatedUrl = result.Attributes as NFCUrl;
      return updatedUrl.accessCount;
    } catch (error) {
      logger.error('Failed to increment access count', error as Error, { 
        familyId, 
        itemId, 
        urlId 
      });
      throw error;
    }
  }

  /**
   * Update itemName in NFC URL (denormalization update)
   * 
   * @param familyId - Family UUID
   * @param itemId - Item UUID
   * @param newItemName - Updated item name
   * @returns Number of URLs updated
   */
  static async updateItemName(
    familyId: string,
    itemId: string,
    newItemName: string
  ): Promise<number> {
    try {
      // Get all URLs for this item
      const urls = await this.listByItem(familyId, itemId, true);
      
      // Update each URL with new item name
      const updatePromises = urls.map(url =>
        docClient.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: {
              PK: url.PK,
              SK: url.SK,
            },
            UpdateExpression: 'SET itemName = :itemName',
            ExpressionAttributeValues: {
              ':itemName': newItemName,
            },
          })
        )
      );

      await Promise.all(updatePromises);
      
      logger.info('Updated itemName in NFC URLs', { 
        familyId, 
        itemId, 
        count: urls.length 
      });
      
      return urls.length;
    } catch (error) {
      logger.error('Failed to update itemName in NFC URLs', error as Error, { 
        familyId, 
        itemId 
      });
      throw error;
    }
  }
}
