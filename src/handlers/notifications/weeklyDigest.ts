/**
 * Weekly Digest Handler
 *
 * Runs weekly on Mondays at 9:00 AM (configurable per-user timezone) to compile
 * and send outstanding notifications as a digest email to users with WEEKLY preference.
 */

import { ScheduledHandler } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { docClient, getTableName } from '../../lib/dynamodb';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../../lib/logger';
import { handleWarmup, warmupResponse } from '../../lib/warmup';
import { generateUUID } from '../../lib/uuid';
import { MemberModel } from '../../models/member';
import { buildDigestEmail, DigestNotification } from '../../lib/email/templates/notificationDigest';
import { publishJobMetrics, logJobEvent, JobMetrics } from '../../lib/monitoring/notificationMetrics';
import { getFrontendUrl } from '../../config/domain';
import { Member } from '../../types/entities';

const TABLE_NAME = getTableName();
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

      // Get members with WEEKLY email preference
      const members = await MemberModel.listByFamily(familyId);
      const eligibleMembers = members.filter((m) => {
        if (m.unsubscribeAllEmail) return false;
        const prefs = m.notificationPreferences || {};
        // Check if any notification type has WEEKLY email preference
        return Object.entries(prefs).some(
          ([key, freq]) => key.endsWith(':EMAIL') && freq === 'WEEKLY'
        );
      });

      metrics.targetUserCount += eligibleMembers.length;

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

      if (notifications.length === 0) {
        metrics.skippedCount += eligibleMembers.length;
        continue;
      }

      // Send digest to each eligible member
      for (const member of eligibleMembers) {
        try {
          await sendDigestEmail(member, notifications, 'weekly');
          metrics.emailSentCount++;
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
    type: n.type,
    message: n.itemName || `${n.type} notification`,
    createdAt: n.createdAt,
    itemName: n.itemName,
  }));

  const unsubscribeUrl = getFrontendUrl(`/api/notifications/unsubscribe?memberId=${member.memberId}`);
  const preferencesUrl = getFrontendUrl(`/settings/notifications?familyId=${member.familyId}&memberId=${member.memberId}`);
  const dashboardUrl = getFrontendUrl(`/notifications?familyId=${member.familyId}`);

  const { subject, text, html } = buildDigestEmail({
    recipientName: member.name,
    digestType,
    notifications: digestNotifications,
    unsubscribeUrl,
    preferencesUrl,
    dashboardUrl,
  });

  await ses.send(
    new SendEmailCommand({
      Source: fromEmail,
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

export default handler;
