/**
 * Minimal send path for notifications (stubbed).
 * Logs the send attempt and marks the delivery ledger to avoid duplicates.
 */
import deliveryLedger from './deliveryLedger';
import { createLambdaLogger } from '../../lib/logger';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import buildNotificationEmail from '../../lib/email/templates/notificationTemplate';

export async function sendNotification(
  familyId: string,
  notificationId: string,
  channel: string,
  payload?: Record<string, unknown>,
  requestId?: string
) {
  const logger = createLambdaLogger(requestId);
  logger.info('sendNotification (start)', { familyId, notificationId, channel, payload });

  // If SES is configured and a recipient is provided, attempt to send an email
  const from = process.env['SES_FROM_EMAIL'];
  const toRaw = payload && (payload['to'] as string | string[] | undefined);
  const toAddrs: string[] = [];
  if (typeof toRaw === 'string') toAddrs.push(toRaw);
  if (Array.isArray(toRaw)) toAddrs.push(...toRaw.filter(Boolean) as string[]);

  if (from && toAddrs.length > 0 && channel === 'EMAIL') {
    try {
      const ses = new SESClient({ region: process.env['AWS_REGION'] || 'us-east-1' });
      // Build the email content from the notification template
      const title = (payload && (payload['title'] as string)) || `Notification ${notificationId}`;
      const msg = (payload && (payload['message'] as string)) || `You have a new notification (id=${notificationId}) for family ${familyId}.`;
      const unsubscribeUrl = payload && (payload['unsubscribeUrl'] as string | undefined);
      const preferencesUrl = payload && (payload['preferencesUrl'] as string | undefined);

      const { subject, text, html } = buildNotificationEmail({
        title,
        message: msg,
        unsubscribeUrl,
        preferencesUrl,
      });

      const cmd = new SendEmailCommand({
        Source: from,
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

      // Mark delivered in ledger after successful send
      await deliveryLedger.markDelivered(familyId, notificationId, channel, 'IMMEDIATE', new Date().toISOString());
      return { success: true, result };
    } catch (err) {
      logger.error('SES send failed', err as Error, { familyId, notificationId });
      // Fall through to ledger marking below to avoid retries in this minimal implementation
    }
  }

  // Fallback/stub behavior: mark as delivered to avoid duplicate sends
  try {
    await deliveryLedger.markDelivered(familyId, notificationId, channel, 'IMMEDIATE', new Date().toISOString());
    return { success: true };
  } catch (err) {
    logger.error('sendNotification failed', err as Error, { familyId, notificationId });
    return { success: false, error: (err as Error).message };
  }
}

export default { sendNotification };
