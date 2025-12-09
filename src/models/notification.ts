/**
 * Notification Model - Family Inventory Management System
 *
 * Handles DynamoDB operations for Notification entities.
 * Supports low-stock notifications with status lifecycle:
 * active -> acknowledged (by admin) or active -> resolved (when quantity rises above threshold)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { logger } from '../lib/logger';
import { generateUUID } from '../lib/uuid';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env['TABLE_NAME'] || 'InventoryManagement';

/**
 * Low-stock notification status
 */
export type LowStockNotificationStatus = 'active' | 'resolved' | 'acknowledged';

/**
 * Low-stock notification type
 */
export type LowStockNotificationType = 'low_stock';

/**
 * Low-stock Notification Entity
 * Represents an alert when inventory items fall below thresholds
 */
export interface LowStockNotification {
  PK: string;
  SK: string;
  GSI2PK: string;
  GSI2SK: string;
  notificationId: string;
  familyId: string;
  itemId: string;
  itemName: string;
  type: LowStockNotificationType;
  status: LowStockNotificationStatus;
  currentQuantity: number;
  threshold: number;
  entityType: 'Notification';
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

/**
 * Input for creating a low-stock notification
 */
export interface LowStockNotificationInput {
  familyId: string;
  itemId: string;
  itemName: string;
  currentQuantity: number;
  threshold: number;
}

/**
 * Key builder for low-stock notifications
 */
const buildNotificationKeys = (
  familyId: string,
  notificationId: string,
  status: LowStockNotificationStatus,
  createdAt: string
): { PK: string; SK: string; GSI2PK: string; GSI2SK: string } => ({
  PK: `FAMILY#${familyId}`,
  SK: `NOTIFICATION#${notificationId}`,
  GSI2PK: `FAMILY#${familyId}#NOTIFICATIONS`,
  GSI2SK: `STATUS#${status}#CREATED#${createdAt}`,
});

/**
 * NotificationModel
 * Handles DynamoDB operations for low-stock notifications
 */
export class NotificationModel {
  /**
   * Create a new low-stock notification
   */
  static async create(input: LowStockNotificationInput): Promise<LowStockNotification> {
    const notificationId = generateUUID();
    const now = new Date().toISOString();
    const status: LowStockNotificationStatus = 'active';

    const keys = buildNotificationKeys(input.familyId, notificationId, status, now);

    const notification: LowStockNotification = {
      ...keys,
      notificationId,
      familyId: input.familyId,
      itemId: input.itemId,
      itemName: input.itemName,
      type: 'low_stock',
      status,
      currentQuantity: input.currentQuantity,
      threshold: input.threshold,
      entityType: 'Notification',
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: notification,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );

      logger.info('Low-stock notification created', {
        notificationId,
        familyId: input.familyId,
        itemId: input.itemId,
        itemName: input.itemName,
      });

      return notification;
    } catch (error) {
      logger.error('Failed to create low-stock notification', error as Error, { input });
      throw error;
    }
  }

  /**
   * Get notification by ID
   */
  static async getById(
    familyId: string,
    notificationId: string
  ): Promise<LowStockNotification | null> {
    try {
      const result = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `FAMILY#${familyId}`,
            SK: `NOTIFICATION#${notificationId}`,
          },
        })
      );

      if (!result.Item) {
        return null;
      }

      return result.Item as LowStockNotification;
    } catch (error) {
      logger.error('Failed to get notification', error as Error, { familyId, notificationId });
      throw error;
    }
  }

  /**
   * List all notifications for a family
   */
  static async listByFamily(familyId: string): Promise<LowStockNotification[]> {
    try {
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `FAMILY#${familyId}`,
            ':sk': 'NOTIFICATION#',
          },
        })
      );

      return (result.Items || []) as LowStockNotification[];
    } catch (error) {
      logger.error('Failed to list notifications', error as Error, { familyId });
      throw error;
    }
  }

  /**
   * List notifications by status using GSI2
   */
  static async listByStatus(
    familyId: string,
    status: LowStockNotificationStatus
  ): Promise<LowStockNotification[]> {
    try {
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'GSI2',
          KeyConditionExpression: 'GSI2PK = :gsi2pk AND begins_with(GSI2SK, :gsi2sk)',
          ExpressionAttributeValues: {
            ':gsi2pk': `FAMILY#${familyId}#NOTIFICATIONS`,
            ':gsi2sk': `STATUS#${status}#`,
          },
        })
      );

      return (result.Items || []) as LowStockNotification[];
    } catch (error) {
      logger.error('Failed to list notifications by status', error as Error, { familyId, status });
      throw error;
    }
  }

  /**
   * List active notifications for a family
   */
  static async listActive(familyId: string): Promise<LowStockNotification[]> {
    return this.listByStatus(familyId, 'active');
  }

  /**
   * Update notification status
   */
  static async updateStatus(
    familyId: string,
    notificationId: string,
    newStatus: LowStockNotificationStatus
  ): Promise<LowStockNotification> {
    const now = new Date().toISOString();

    try {
      // Get current notification to get createdAt for GSI2SK update
      const currentNotification = await this.getById(familyId, notificationId);
      if (!currentNotification) {
        throw new Error('Notification not found');
      }

      // Build new GSI2SK with updated status
      const newGSI2SK = `STATUS#${newStatus}#CREATED#${currentNotification.createdAt}`;

      const updateExpression =
        newStatus === 'resolved'
          ? 'SET #status = :status, #updatedAt = :updatedAt, #resolvedAt = :resolvedAt, #GSI2SK = :GSI2SK'
          : 'SET #status = :status, #updatedAt = :updatedAt, #GSI2SK = :GSI2SK';

      const expressionAttributeNames: Record<string, string> = {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
        '#GSI2SK': 'GSI2SK',
      };

      const expressionAttributeValues: Record<string, unknown> = {
        ':status': newStatus,
        ':updatedAt': now,
        ':GSI2SK': newGSI2SK,
      };

      if (newStatus === 'resolved') {
        expressionAttributeNames['#resolvedAt'] = 'resolvedAt';
        expressionAttributeValues[':resolvedAt'] = now;
      }

      const result = await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `FAMILY#${familyId}`,
            SK: `NOTIFICATION#${notificationId}`,
          },
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ConditionExpression: 'attribute_exists(PK)',
          ReturnValues: 'ALL_NEW',
        })
      );

      if (!result.Attributes) {
        throw new Error('Notification not found');
      }

      logger.info('Notification status updated', {
        notificationId,
        familyId,
        oldStatus: currentNotification.status,
        newStatus,
      });

      return result.Attributes as LowStockNotification;
    } catch (error) {
      logger.error('Failed to update notification status', error as Error, {
        familyId,
        notificationId,
        newStatus,
      });
      throw error;
    }
  }

  /**
   * Find active notification for a specific item
   * Used to check if a notification already exists before creating a new one
   */
  static async findActiveByItemId(
    familyId: string,
    itemId: string
  ): Promise<LowStockNotification | null> {
    try {
      const activeNotifications = await this.listActive(familyId);
      return activeNotifications.find((n) => n.itemId === itemId) || null;
    } catch (error) {
      logger.error('Failed to find active notification by item ID', error as Error, {
        familyId,
        itemId,
      });
      throw error;
    }
  }

  /**
   * Resolve all active notifications for a specific item
   * Called when item quantity rises above threshold
   */
  static async resolveByItemId(familyId: string, itemId: string): Promise<void> {
    try {
      const activeNotification = await this.findActiveByItemId(familyId, itemId);

      if (activeNotification) {
        await this.updateStatus(familyId, activeNotification.notificationId, 'resolved');
        logger.info('Notification resolved for item', { familyId, itemId });
      }
    } catch (error) {
      logger.error('Failed to resolve notifications by item ID', error as Error, {
        familyId,
        itemId,
      });
      throw error;
    }
  }
}