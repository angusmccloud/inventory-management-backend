import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, getTableName } from '../lib/dynamodb.js';
import { generateUUID } from '../lib/uuid.js';
import { logger } from '../lib/logger.js';
import { BaseEntity, SuggestionType } from '../types/entities.js';
import { LowStockNotification } from './notification.js';

const TABLE_NAME = getTableName();

export type NotificationEventStatus = 'active' | 'resolved';

export interface DeliveryLedgerEntry {
  lastSentAt?: string | null;
  digestRunId?: string | null;
}

export interface SuggestionResponseNotification extends BaseEntity {
  PK: string;
  SK: string;
  GSI2PK: string;
  GSI2SK: string;
  notificationId: string;
  familyId: string;
  recipientId: string;
  type: 'suggestion_response';
  status: NotificationEventStatus;
  suggestionId: string;
  suggestionType: SuggestionType;
  suggestionDecision: 'approved' | 'rejected';
  suggestedBy: string;
  suggestedByName: string;
  reviewedBy: string;
  reviewedByName: string;
  itemName?: string;
  entityType: 'Notification';
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  sourceContext?: Record<string, unknown>;
  deliveryLedger?: Record<string, DeliveryLedgerEntry>;
}

export type NotificationEvent = LowStockNotification | SuggestionResponseNotification;

export interface SuggestionResponseNotificationInput {
  familyId: string;
  suggestionId: string;
  suggestionType: SuggestionType;
  suggestionDecision: 'approved' | 'rejected';
  suggestedBy: string;
  suggestedByName: string;
  reviewedBy: string;
  reviewedByName: string;
  itemName?: string;
  sourceContext?: Record<string, unknown>;
}

const buildNotificationEventKeys = (
  familyId: string,
  notificationId: string,
  status: NotificationEventStatus,
  createdAt: string
): { PK: string; SK: string; GSI2PK: string; GSI2SK: string } => ({
  PK: `FAMILY#${familyId}`,
  SK: `NOTIFICATION#${notificationId}`,
  GSI2PK: `FAMILY#${familyId}#NOTIFICATIONS`,
  GSI2SK: `STATUS#${status}#CREATED#${createdAt}`,
});

export class NotificationEventModel {
  static async createSuggestionResponse(
    input: SuggestionResponseNotificationInput
  ): Promise<SuggestionResponseNotification> {
    const notificationId = generateUUID();
    const now = new Date().toISOString();
    const status: NotificationEventStatus = 'active';

    const keys = buildNotificationEventKeys(input.familyId, notificationId, status, now);

    const notification: SuggestionResponseNotification = {
      ...keys,
      notificationId,
      familyId: input.familyId,
      recipientId: input.suggestedBy,
      type: 'suggestion_response',
      status,
      suggestionId: input.suggestionId,
      suggestionType: input.suggestionType,
      suggestionDecision: input.suggestionDecision,
      suggestedBy: input.suggestedBy,
      suggestedByName: input.suggestedByName,
      reviewedBy: input.reviewedBy,
      reviewedByName: input.reviewedByName,
      itemName: input.itemName,
      entityType: 'Notification',
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      sourceContext: input.sourceContext,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: notification,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );

      logger.info('Suggestion response notification created', {
        notificationId,
        familyId: input.familyId,
        suggestionId: input.suggestionId,
        decision: input.suggestionDecision,
        recipientId: input.suggestedBy,
      });

      return notification;
    } catch (error) {
      logger.error('Failed to create suggestion response notification', error as Error, {
        suggestionId: input.suggestionId,
        familyId: input.familyId,
      });
      throw error;
    }
  }

  static async listActive(familyId: string): Promise<NotificationEvent[]> {
    try {
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'GSI2',
          KeyConditionExpression: 'GSI2PK = :gsi2pk AND begins_with(GSI2SK, :gsi2sk)',
          ExpressionAttributeValues: {
            ':gsi2pk': `FAMILY#${familyId}#NOTIFICATIONS`,
            ':gsi2sk': 'STATUS#active#',
          },
        })
      );

      return (result.Items || []) as NotificationEvent[];
    } catch (error) {
      logger.error('Failed to list active notification events', error as Error, { familyId });
      throw error;
    }
  }

  static async resolve(familyId: string, notificationId: string): Promise<void> {
    try {
      const current = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `FAMILY#${familyId}`,
            SK: `NOTIFICATION#${notificationId}`,
          },
        })
      );

      const existing = current.Item as NotificationEvent | undefined;
      if (!existing || existing.status === 'resolved') {
        return;
      }

      const now = new Date().toISOString();
      const newGSI2SK = `STATUS#resolved#CREATED#${existing.createdAt}`;

      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `FAMILY#${familyId}`,
            SK: `NOTIFICATION#${notificationId}`,
          },
          UpdateExpression:
            'SET #status = :status, #updatedAt = :updatedAt, #resolvedAt = :resolvedAt, #GSI2SK = :gsi2sk',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#updatedAt': 'updatedAt',
            '#resolvedAt': 'resolvedAt',
            '#GSI2SK': 'GSI2SK',
          },
          ExpressionAttributeValues: {
            ':status': 'resolved',
            ':updatedAt': now,
            ':resolvedAt': now,
            ':gsi2sk': newGSI2SK,
          },
          ConditionExpression: 'attribute_exists(PK)',
        })
      );
    } catch (error) {
      logger.error('Failed to resolve notification event', error as Error, {
        familyId,
        notificationId,
      });
      throw error;
    }
  }
}

export default NotificationEventModel;
