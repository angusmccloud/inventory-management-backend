/**
 * Immediate Dispatcher
 * Runs every 15 minutes, queries unresolved NotificationEvents, filters by preferences,
 * and sends immediate emails while updating the delivery ledger.
 */
import { ScheduledHandler } from 'aws-lambda';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../../lib/logger';
import { handleWarmup, warmupResponse } from '../../lib/warmup';
import { sendNotification } from '../../services/notifications/send';
import { publishJobMetrics, logJobEvent, JobMetrics } from '../../lib/monitoring/notificationMetrics';
import { generateUUID } from '../../lib/uuid';
import { MemberModel } from '../../models/member';
import { FamilyModel } from '../../models/family';
import { NotificationModel, LowStockNotification } from '../../models/notification';
import { InventoryItemModel } from '../../models/inventory';
import { DEFAULT_FREQUENCY, normalizePreferenceValue } from '../../services/notifications/defaults';
import { createUnsubscribeToken } from '../../lib/unsubscribeToken';
import { hasBeenDelivered, markDelivered } from '../../services/notifications/deliveryLedger';

export const handler: ScheduledHandler = async (event, context) => {
  if (handleWarmup(event as unknown as Record<string, unknown>, context)) {
    warmupResponse();
    return;
  }

  const logger = createLambdaLogger(context.awsRequestId);
  logLambdaInvocation('immediateDispatcher', event, context.awsRequestId);

  const runId = generateUUID();
  const startedAt = new Date();

  const metrics: JobMetrics = {
    jobType: 'IMMEDIATE',
    runId,
    startedAt,
    targetUserCount: 0,
    emailSentCount: 0,
    skippedCount: 0,
    errorCount: 0,
  };

  logJobEvent(context.awsRequestId, 'start', 'IMMEDIATE', { runId });

  try {
    const families = await FamilyModel.listAll();
    let processed = 0;

    for (const family of families) {
      const familyId = family.familyId;
      const members = await MemberModel.listByFamily(familyId);
      const notifications = await NotificationModel.listActive(familyId);
      const unitOverrides = await resolveUnitsForNotifications(familyId, notifications);

      for (const member of members) {
        if (!member.email || member.unsubscribeAllEmail) {
          metrics.skippedCount++;
          continue;
        }

        const eligibleNotifications: LowStockNotification[] = [];
        for (const notification of notifications) {
          const typeKey = normalizeNotificationType(notification.type);
          const preferenceKey = `${typeKey}:EMAIL`;
          const rawPreference = member.notificationPreferences?.[preferenceKey];
          const frequencies = normalizePreferenceValue(rawPreference);
          const effective =
            rawPreference === undefined || rawPreference === null
              ? [DEFAULT_FREQUENCY]
              : frequencies;

          if (!effective.includes('IMMEDIATE')) {
            continue;
          }

          const alreadyDelivered = await hasBeenDelivered(
            familyId,
            notification.notificationId,
            'EMAIL',
            'IMMEDIATE',
            member.memberId
          );
          if (alreadyDelivered) {
            continue;
          }

          eligibleNotifications.push(notification as LowStockNotification);
        }

        if (eligibleNotifications.length === 0) {
          metrics.skippedCount++;
          continue;
        }

        metrics.targetUserCount++;

        const { title, message } = buildImmediateBatchMessage(eligibleNotifications, unitOverrides);
        const links = buildPreferenceLinks(familyId, member.memberId);

        const result = await sendNotification(
          familyId,
          eligibleNotifications[0]!.notificationId,
          'EMAIL',
          'IMMEDIATE',
          {
            to: member.email,
            title,
            message,
            unsubscribeUrl: links.unsubscribeUrl,
            preferencesUrl: links.preferencesUrl,
          },
          context.awsRequestId,
          member.memberId,
          { skipLedger: true }
        );

        if (result.success) {
          for (const notification of eligibleNotifications) {
            await markDelivered(
              familyId,
              notification.notificationId,
              'EMAIL',
              'IMMEDIATE',
              new Date().toISOString(),
              member.memberId
            );
          }
          metrics.emailSentCount++;
          processed++;
        } else {
          metrics.errorCount++;
        }
      }
    }

    metrics.completedAt = new Date();

    await publishJobMetrics(metrics);
    logJobEvent(context.awsRequestId, 'complete', 'IMMEDIATE', {
      runId,
      processed,
      targetUserCount: metrics.targetUserCount,
      emailSentCount: metrics.emailSentCount,
      errorCount: metrics.errorCount,
    });

    logLambdaCompletion('immediateDispatcher', Date.now() - startedAt.getTime(), context.awsRequestId);
    logger.info('Immediate dispatcher completed', { processed, runId });
    return;
  } catch (err) {
    metrics.errorCount++;
    metrics.completedAt = new Date();
    await publishJobMetrics(metrics);
    logJobEvent(context.awsRequestId, 'error', 'IMMEDIATE', {
      runId,
      error: (err as Error).message,
    });
    logger.error('Immediate dispatcher failed', err as Error);
    throw err;
  }
};

function normalizeNotificationType(rawType: string): string {
  return rawType
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toUpperCase();
}

function buildNotificationMessage(notification: LowStockNotification, unitOverride?: string): string {
  const itemName = notification.itemName || 'Item';
  const unit = unitOverride || notification.unit;
  if (unit) {
    return `Your inventory item "${itemName}" is low (${notification.currentQuantity} ${unit}).`;
  }
  return `Your inventory item "${itemName}" is low (${notification.currentQuantity}).`;
}

function buildImmediateBatchMessage(
  notifications: LowStockNotification[],
  unitOverrides: Record<string, string>
): { title: string; message: string } {
  const title =
    notifications.length === 1
      ? 'New low stock item'
      : `New low stock items (${notifications.length})`;
  const lines = notifications.map((notification) => {
    const unitOverride = unitOverrides[notification.itemId];
    return `- ${buildNotificationMessage(notification, unitOverride)}`;
  });
  return { title, message: lines.join('\n') };
}

async function resolveUnitsForNotifications(
  familyId: string,
  notifications: LowStockNotification[]
): Promise<Record<string, string>> {
  const unitByItemId: Record<string, string> = {};
  const missingUnitItemIds = Array.from(
    new Set(
      notifications
        .filter((notification) => !notification.unit && notification.itemId)
        .map((notification) => notification.itemId)
    )
  );

  for (const itemId of missingUnitItemIds) {
    const item = await InventoryItemModel.getById(familyId, itemId);
    if (item?.unit) {
      unitByItemId[itemId] = item.unit;
    }
  }

  return unitByItemId;
}

function buildPreferenceLinks(familyId: string, memberId: string) {
  const secret = process.env['UNSUBSCRIBE_SECRET'] || '';
  let unsubscribeUrl: string | undefined;
  if (secret) {
    const token = createUnsubscribeToken(
      {
        memberId,
        familyId,
        action: 'unsubscribe_all',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
      },
      secret
    );
    unsubscribeUrl = `https://www.inventoryhq.io/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`;
  }

  return {
    unsubscribeUrl,
    preferencesUrl: 'https://www.inventoryhq.io/settings?tab=notifications',
  };
}

export default handler;
