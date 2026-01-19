/**
 * Queue Preview Service
 *
 * Provides admin visibility into pending notification deliveries
 * without triggering actual sends. Used for operational monitoring.
 */

import { MemberModel } from '../../models/member';
import { FamilyModel } from '../../models/family';
import { NotificationEventModel, NotificationEvent } from '../../models/notificationEvent';
import { Member, Frequency } from '../../types/entities';
import { DEFAULT_FREQUENCY, normalizePreferenceValue } from './defaults';

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

  const families = await FamilyModel.listAll();

  for (const family of families) {
    const familyId = family.familyId;
    if (!familyId) continue;

    // Get all members
    const members = await MemberModel.listByFamily(familyId);
    const eligibleMembers = members.filter((m) => !m.unsubscribeAllEmail);

    const notifications = await NotificationEventModel.listActive(familyId);

    if (notifications.length === 0) continue;

    // For each member, determine what would be sent
    for (const member of eligibleMembers) {
      for (const notification of notifications) {
        if ('recipientId' in notification && notification.recipientId && notification.recipientId !== member.memberId) {
          continue;
        }

        const deliveryMethods = getDeliveryMethods(member, notification);
        if (deliveryMethods.length === 0) continue;

        // Check if already sent (simplified - in production check delivery ledger)
        const alreadySent = false; // TODO: check deliveryLedger

        if (alreadySent) continue;

        for (const deliveryMethod of deliveryMethods) {
          const queued: QueuedDelivery = {
            memberId: member.memberId,
            memberEmail: member.email,
            memberName: member.name,
            familyId,
            notificationId: notification.notificationId,
            notificationType: normalizeNotificationType(notification.type),
            itemName: 'itemName' in notification ? notification.itemName : undefined,
            createdAt: notification.createdAt,
            deliveryMethod,
            reason: `${normalizeNotificationType(notification.type)} notification pending ${deliveryMethod.toLowerCase()} delivery`,
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
function getDeliveryMethods(
  member: Member,
  notification: NotificationEvent
): Array<Exclude<Frequency, 'NONE'>> {
  const prefs = member.notificationPreferences || {};
  const typeKey = normalizeNotificationType(notification.type);
  const key = `${typeKey}:EMAIL`;
  const rawPref = prefs[key];
  const prefList = normalizePreferenceValue(rawPref);
  const effective = rawPref === undefined || rawPref === null ? [DEFAULT_FREQUENCY] : prefList;

  return effective.filter((freq): freq is Exclude<Frequency, 'NONE'> => freq !== 'NONE');
}

function normalizeNotificationType(rawType: string): string {
  const normalized = rawType
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toUpperCase();
  if (normalized === 'SUGGESTION_RESPONSE') {
    return 'SUGGESTION';
  }
  return normalized;
}

export default {
  previewDeliveryQueue,
};
