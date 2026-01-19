/**
 * Weekly Digest Handler
 *
 * Runs weekly on Mondays at 9:00 AM (configurable per-user timezone) to compile
 * and send outstanding notifications as a digest email to users with WEEKLY preference.
 */

import { ScheduledHandler } from 'aws-lambda';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../../lib/logger';
import { handleWarmup, warmupResponse } from '../../lib/warmup';
import { generateUUID } from '../../lib/uuid';
import { MemberModel } from '../../models/member';
import { FamilyModel } from '../../models/family';
import { NotificationModel } from '../../models/notification';
import { buildDigestEmail, DigestNotification } from '../../lib/email/templates/notificationDigest';
import { publishJobMetrics, logJobEvent, JobMetrics } from '../../lib/monitoring/notificationMetrics';
import { getFrontendUrl } from '../../config/domain';
import { Member } from '../../types/entities';
import { DEFAULT_FREQUENCY, normalizePreferenceValue } from '../../services/notifications/defaults';
import { createUnsubscribeToken } from '../../lib/unsubscribeToken';
import { markDelivered } from '../../services/notifications/deliveryLedger';

const ses = new SESClient({ region: process.env['AWS_REGION'] || 'us-east-1' });

export const handler: ScheduledHandler = async (event, context) => {
  // Handle warmup events
  if (handleWarmup(event as unknown as Record<string, unknown>, context)) {
    warmupResponse();
    return;
  }

  const logger = createLambdaLogger(context.awsRequestId);
  logLambdaInvocation('weeklyDigest', event, context.awsRequestId);

  const runId = generateUUID();
  const startedAt = new Date();

  const metrics: JobMetrics = {
    jobType: 'WEEKLY',
    runId,
    startedAt,
    targetUserCount: 0,
    emailSentCount: 0,
    skippedCount: 0,
    errorCount: 0,
  };

  logJobEvent(context.awsRequestId, 'start', 'WEEKLY', { runId });

  try {
    const families = await FamilyModel.listAll();

    for (const family of families) {
      const familyId = family.familyId;
      if (!familyId) continue;

      // Get members with WEEKLY email preference
      const members = await MemberModel.listByFamily(familyId);
      const eligibleMembers = members.filter((m) => isMemberEligibleForDigest(m, 'WEEKLY'));

      metrics.targetUserCount += eligibleMembers.length;

      const notifications = await NotificationModel.listActive(familyId);

      // Send digest to each eligible member
      for (const member of eligibleMembers) {
        try {
          const memberNotifications = filterNotificationsForMember(
            member,
            notifications,
            'WEEKLY'
          );

          if (memberNotifications.length === 0) {
            metrics.skippedCount++;
            continue;
          }

          await sendDigestEmail(member, memberNotifications, 'weekly');
          metrics.emailSentCount++;

          await markDigestDelivered(familyId, member.memberId, memberNotifications, 'WEEKLY');
        } catch (err) {
          logger.error('Failed to send weekly digest', err as Error, {
            memberId: member.memberId,
            familyId,
          });
          metrics.errorCount++;
        }
      }
    }

    metrics.completedAt = new Date();
    await publishJobMetrics(metrics);
    logJobEvent(context.awsRequestId, 'complete', 'WEEKLY', {
      ...metrics,
      durationMs: metrics.completedAt.getTime() - startedAt.getTime(),
    });

    logLambdaCompletion('weeklyDigest', Date.now() - startedAt.getTime(), context.awsRequestId);

    return;
  } catch (err) {
    logger.error('Weekly digest job failed', err as Error);
    metrics.errorCount++;
    metrics.completedAt = new Date();
    await publishJobMetrics(metrics);
    logJobEvent(context.awsRequestId, 'error', 'WEEKLY', { runId, error: (err as Error).message });
    throw err;
  }
};

async function sendDigestEmail(
  member: Member,
  notifications: Array<{
    notificationId: string;
    type: string;
    itemName?: string;
    createdAt: string;
  }>,
  digestType: 'daily' | 'weekly'
): Promise<void> {
  const fromEmail = process.env['SES_FROM_EMAIL'];
  if (!fromEmail) {
    throw new Error('SES_FROM_EMAIL not configured');
  }

  const digestNotifications: DigestNotification[] = notifications.map((n) => ({
    notificationId: n.notificationId,
    type: normalizeNotificationType(n.type),
    message: n.itemName || `${n.type} notification`,
    createdAt: n.createdAt,
    itemName: n.itemName,
  }));

  const unsubscribeUrl = buildUnsubscribeUrl(member.familyId, member.memberId);
  const preferencesUrl = 'https://www.inventoryhq.io/settings?tab=notifications';
  const dashboardUrl = getFrontendUrl(`/notifications?familyId=${member.familyId}`);
  const shoppingListUrl = 'https://www.inventoryhq.io/shopping-list';
  const inventoryUrl = 'https://www.inventoryhq.io/inventory';

  const { subject, text, html } = buildDigestEmail({
    recipientName: member.name,
    digestType,
    notifications: digestNotifications,
    unsubscribeUrl,
    preferencesUrl,
    dashboardUrl,
    shoppingListUrl,
    inventoryUrl,
  });

  await ses.send(
    new SendEmailCommand({
      Source: `Inventory HQ <${fromEmail}>`,
      Destination: { ToAddresses: [member.email] },
      Message: {
        Subject: { Data: subject },
        Body: {
          Text: { Data: text },
          Html: { Data: html },
        },
      },
    })
  );
}

function normalizeNotificationType(rawType: string): string {
  return rawType
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toUpperCase();
}

function filterNotificationsForMember(
  member: Member,
  notifications: Array<{ notificationId: string; type: string; itemName?: string; createdAt: string }>,
  frequency: 'DAILY' | 'WEEKLY'
) {
  const prefs = member.notificationPreferences || {};
  return notifications.filter((notification) => {
    const typeKey = normalizeNotificationType(notification.type);
    const prefKey = `${typeKey}:EMAIL`;
    const rawPref = prefs[prefKey];
    const prefList = normalizePreferenceValue(rawPref);
    const effective =
      rawPref === undefined || rawPref === null ? [DEFAULT_FREQUENCY] : prefList;
    return effective.includes(frequency);
  });
}

function isMemberEligibleForDigest(member: Member, frequency: 'DAILY' | 'WEEKLY') {
  if (member.unsubscribeAllEmail) return false;

  const prefs = member.notificationPreferences || {};
  const keys = Object.keys(prefs);
  if (keys.length === 0) {
    return DEFAULT_FREQUENCY === frequency;
  }

  return Object.entries(prefs).some(
    ([key, pref]) => {
      if (!key.endsWith(':EMAIL')) return false;
      const prefList = normalizePreferenceValue(pref);
      const effective =
        pref === undefined || pref === null ? [DEFAULT_FREQUENCY] : prefList;
      return effective.includes(frequency);
    }
  );
}

async function markDigestDelivered(
  familyId: string,
  memberId: string,
  notifications: Array<{ notificationId: string }>,
  frequency: 'DAILY' | 'WEEKLY'
) {
  const now = new Date().toISOString();
  for (const notification of notifications) {
    await markDelivered(familyId, notification.notificationId, 'EMAIL', frequency, now, memberId);
  }
}

function buildUnsubscribeUrl(familyId: string, memberId: string) {
  const secret = process.env['UNSUBSCRIBE_SECRET'] || '';
  if (!secret) return undefined;

  const token = createUnsubscribeToken(
    {
      memberId,
      familyId,
      action: 'unsubscribe_all',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
    },
    secret
  );

  return getFrontendUrl(`/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`);
}

export default handler;
