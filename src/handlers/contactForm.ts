import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { logger } from '../lib/logger.js';
import { badRequestResponse, successResponse, internalServerErrorResponse } from '../lib/response.js';
import { handleWarmup, warmupResponse } from '../lib/warmup.js';

interface ContactPayload {
  name?: string;
  email?: string;
  message?: string;
}

const ses = new SESClient({});

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  try {
    if (!event.body) {
      return badRequestResponse('Missing request body');
    }

    const parsed: ContactPayload = JSON.parse(event.body);
    const name = (parsed.name || 'Anonymous').trim();
    const fromEmail = process.env['SES_FROM_EMAIL'] || '';
    const recipient = process.env['CONTACT_RECIPIENT'] || 'connort@gmail.com';
    const userEmail = (parsed.email || '').trim();
    const message = (parsed.message || '').trim();

    if (!message) {
      return badRequestResponse('Message is required');
    }

    const subject = `Contact Form Message from ${name}`;
    const textBody = `Name: ${name}\nEmail: ${userEmail || 'N/A'}\n\nMessage:\n${message}`;
    const htmlBody = `<p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${userEmail || 'N/A'}</p><hr/><p>${message.replace(/\n/g, '<br/>')}</p>`;

    if (!fromEmail) {
      logger.warn('SES_FROM_EMAIL not configured; aborting send');
      return internalServerErrorResponse('Email sending not configured');
    }

    const command = new SendEmailCommand({
      Destination: { ToAddresses: [recipient] },
      Message: {
        Body: {
          Html: { Charset: 'UTF-8', Data: htmlBody },
          Text: { Charset: 'UTF-8', Data: textBody },
        },
        Subject: { Charset: 'UTF-8', Data: subject },
      },
      Source: fromEmail,
      ReplyToAddresses: userEmail ? [userEmail] : undefined,
    });

    await ses.send(command);

    logger.info('Contact form sent', { name, userEmail });

    return successResponse({ message: 'Message sent successfully' });
  } catch (err) {
    logger.error('Failed to send contact form', err as Error);
    return internalServerErrorResponse('Failed to send message');
  }
};
