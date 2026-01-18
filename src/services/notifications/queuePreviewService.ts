/**
 * Queue Preview Service
 *
 * Provides admin visibility into pending notification deliveries
 * without triggering actual sends. Used for operational monitoring.
 */

import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, getTableName } from '../../lib/dynamodb';
import { MemberModel } from '../../models/member';
import { Member, Frequency } from '../../types/entities';

const TABLE_NAME = getTableName();

export interface QueuedDelivery {
  memberId: string;
  memberEmail: string;
  memberName: string;
  familyId: string;
  notificationId: string;
  notificationType: string;
  itemName?: string;
  createdAt: string;
  deliveryMethod: 'IMMEDIATE' | 'DAILY' | 'WEEKLY';
  reason: string;
}

export interface QueuePreviewResult {
  immediate: QueuedDelivery[];
  daily: QueuedDelivery[];
  weekly: QueuedDelivery[];
  counts: {
    immediate: number;
    daily: number;
    weekly: number;
    total: number;
  };
  generatedAt: string;
}

/**
 * Preview what notifications would be sent without actually sending them
 */
export async function previewDeliveryQueue(): Promise<QueuePreviewResult> {
  const immediate: QueuedDelivery[] = [];
  const daily: QueuedDelivery[] = [];
  const weekly: QueuedDelivery[] = [];

  // Get all families (simplified: in production, use pagination)
  const familiesResult = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'begins_with(GSI1PK, :pk)',
      ExpressionAttributeValues: { ':pk': 'FAMILY#' },
      Limit: 100,
    })
  );

  const families = familiesResult.Items || [];

  for (const family of families) {
    const familyId = family['familyId'] as string;
    if (!familyId) continue;

    // Get all members
    const members = await MemberModel.listByFamily(familyId);
    const eligibleMembers = members.filter((m) => !m.unsubscribeAllEmail);

    // Get active notifications for this family
    const notificationsResult = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':pk': `FAMILY#${familyId}`,
          ':sk': 'NOTIFICATION#',
          ':status': 'active',
        },
      })
    );

    const notifications = (notificationsResult.Items || []) as Array<{
      notificationId: string;
      type: string;
      itemName?: string;
      createdAt: string;
    }>;

    if (notifications.length === 0) continue;

    // For each member, determine what would be sent
    for (const member of eligibleMembers) {
      for (const notification of notifications) {
        const deliveryMethod = getDeliveryMethod(member, notification.type);
        if (deliveryMethod === 'NONE') continue;

        // Check if already sent (simplified - in production check delivery ledger)
        const alreadySent = false; // TODO: check deliveryLedger

        if (alreadySent) continue;

        const queued: QueuedDelivery = {
          memberId: member.memberId,
          memberEmail: member.email,
          memberName: member.name,
          familyId,
          notificationId: notification.notificationId,
          notificationType: notification.type,
          itemName: notification.itemName,
          createdAt: notification.createdAt,
          deliveryMethod,
          reason: `${notification.type} notification pending ${deliveryMethod.toLowerCase()} delivery`,
        };

        if (deliveryMethod === 'IMMEDIATE') {
          immediate.push(queued);
        } else if (deliveryMethod === 'DAILY') {
          daily.push(queued);
        } else if (deliveryMethod === 'WEEKLY') {
          weekly.push(queued);
        }
      }
    }
  }

  return {
    immediate,
    daily,
    weekly,
    counts: {
      immediate: immediate.length,
      daily: daily.length,
      weekly: weekly.length,
      total: immediate.length + daily.length + weekly.length,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Determine delivery method for a member/notification combination
 */
function getDeliveryMethod(
  member: Member,
  notificationType: string
): 'IMMEDIATE' | 'DAILY' | 'WEEKLY' | 'NONE' {
  const prefs = member.notificationPreferences || {};
  const key = `${notificationType}:EMAIL`;
  const frequency = prefs[key] as Frequency | undefined;

  if (!frequency || frequency === 'NONE') return 'NONE';
  return frequency;
}

export default {
  previewDeliveryQueue,
};
