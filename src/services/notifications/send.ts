/**
 * Minimal send path for notifications (stubbed).
 * Logs the send attempt and marks the delivery ledger to avoid duplicates.
 */
import deliveryLedger from './deliveryLedger';
import { createLambdaLogger } from '../../lib/logger';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import buildNotificationEmail from '../../lib/email/templates/notificationTemplate';

export interface NotificationSendPayload {
  to?: string | string[];
  title?: string;
  message?: string;
  unsubscribeUrl?: string;
  preferencesUrl?: string;
  actionLinks?: Array<{ label: string; url: string }>;
}

export interface NotificationSendOptions {
  skipLedger?: boolean;
}

export async function sendNotification(
  familyId: string,
  notificationId: string,
  channel: string,
  frequency: string,
  payload?: NotificationSendPayload,
  requestId?: string,
  memberId?: string,
  options?: NotificationSendOptions
) {
  const logger = createLambdaLogger(requestId);
  logger.info('sendNotification (start)', { familyId, notificationId, channel, payload });

  // If SES is configured and a recipient is provided, attempt to send an email
  const from = process.env['SES_FROM_EMAIL'];
  const toRaw = payload?.to;
  const toAddrs: string[] = [];
  if (typeof toRaw === 'string') toAddrs.push(toRaw);
  if (Array.isArray(toRaw)) toAddrs.push(...toRaw.filter(Boolean) as string[]);

  if (channel !== 'EMAIL') {
    logger.info('sendNotification skipped unsupported channel', { channel, familyId, notificationId });
    return { success: false, error: 'Unsupported channel' };
  }

  if (!from) {
    logger.error('sendNotification missing SES_FROM_EMAIL', undefined, { familyId, notificationId });
    return { success: false, error: 'Missing sender configuration' };
  }

  if (toAddrs.length === 0) {
    logger.error('sendNotification missing recipient', undefined, { familyId, notificationId });
    return { success: false, error: 'Missing recipient' };
  }

  try {
    const ses = new SESClient({ region: process.env['AWS_REGION'] || 'us-east-1' });
    // Build the email content from the notification template
    const title = payload?.title || `Notification ${notificationId}`;
    const msg =
      payload?.message ||
      `You have a new notification (id=${notificationId}) for family ${familyId}.`;
    const unsubscribeUrl = payload?.unsubscribeUrl;
    const preferencesUrl = payload?.preferencesUrl;

    const { subject, text, html } = buildNotificationEmail({
      title,
      message: msg,
      unsubscribeUrl,
      preferencesUrl,
      actionLinks: payload?.actionLinks,
    });

    const cmd = new SendEmailCommand({
      Source: `Inventory HQ <${from}>`,
      Destination: { ToAddresses: toAddrs },
      Message: {
        Subject: { Data: subject },
        Body: {
          Text: { Data: text },
          Html: { Data: html },
        },
      },
    });

    const result = await ses.send(cmd);
    logger.info('SES send result', { result });

    if (!options?.skipLedger) {
      // Mark delivered in ledger after successful send
      await deliveryLedger.markDelivered(
        familyId,
        notificationId,
        channel,
        frequency,
        new Date().toISOString(),
        memberId
      );
    }
    return { success: true, result };
  } catch (err) {
    logger.error('SES send failed', err as Error, { familyId, notificationId });
    return { success: false, error: (err as Error).message };
  }
}

export default { sendNotification };
