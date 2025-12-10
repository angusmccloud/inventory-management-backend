/**
 * Email Service - Send invitation emails via AWS SES
 * Feature: 003-member-management
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { logger } from '../lib/logger';
import { MemberRole } from '../types/invitation';

const sesClient = new SESClient({ region: process.env['AWS_REGION'] || 'us-east-1' });
const ssmClient = new SSMClient({ region: process.env['AWS_REGION'] || 'us-east-1' });

// Cache email template in memory
let cachedTemplate: string | null = null;

/**
 * Get email template from Parameter Store (with caching)
 */
async function getEmailTemplate(): Promise<string> {
  if (cachedTemplate) {
    return cachedTemplate;
  }

  const environment = process.env['NODE_ENV'] || 'dev';
  const parameterName = `/inventory-mgmt/${environment}/email-templates/invitation`;

  try {
    const response = await ssmClient.send(
      new GetParameterCommand({
        Name: parameterName,
      })
    );

    if (!response.Parameter?.Value) {
      throw new Error('Email template parameter is empty');
    }

    cachedTemplate = response.Parameter?.Value || '';
    if (!cachedTemplate) {
      throw new Error('Email template parameter is empty');
    }
    logger.info('Email template loaded from Parameter Store', { parameterName });
    return cachedTemplate;
  } catch (error) {
    logger.error('Failed to load email template', error as Error, { parameterName });
    // Fallback to basic template
    return getDefaultTemplate();
  }
}

/**
 * Get default email template if Parameter Store fails
 */
function getDefaultTemplate(): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 20px auto; padding: 20px; }
    .button { display: inline-block; background-color: #007bff; color: white; 
              padding: 12px 24px; text-decoration: none; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>You're Invited to Join {{familyName}}</h1>
    <p>{{inviterName}} has invited you to join their family on Family Inventory Management.</p>
    <p>You'll be added as a <strong>{{role}}</strong>.</p>
    <p><a href="{{invitationLink}}" class="button">Accept Invitation</a></p>
    <p>This invitation expires on {{expirationDate}}.</p>
    <p>If you didn't expect this invitation, you can safely ignore this email.</p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Get role permissions description for email
 */
function getRolePermissions(role: MemberRole): string {
  if (role === 'admin') {
    return `
      <li>View and manage all inventory items</li>
      <li>Add, edit, and remove items</li>
      <li>Manage shopping lists</li>
      <li>Invite and manage other family members</li>
      <li>Full administrative access</li>
    `;
  } else {
    return `
      <li>View all inventory items</li>
      <li>Suggest new items for admin approval</li>
      <li>View and use shopping lists</li>
      <li>Receive notifications</li>
    `;
  }
}

/**
 * Replace template placeholders with actual values
 */
function renderTemplate(template: string, variables: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    rendered = rendered.replace(new RegExp(placeholder, 'g'), value);
  }
  return rendered;
}

/**
 * Send invitation email
 */
export async function sendInvitationEmail(params: {
  toEmail: string;
  familyName: string;
  inviterName: string;
  role: MemberRole;
  invitationToken: string;
  expiresAt: string;
}): Promise<{ messageId: string }> {
  const { toEmail, familyName, inviterName, role, invitationToken, expiresAt } = params;

  // Build invitation link
  const frontendUrl = process.env['FRONTEND_URL'] || 'http://localhost:3000';
  const invitationLink = `${frontendUrl}/invite/${invitationToken}`;

  // Format expiration date
  const expirationDate = new Date(expiresAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  try {
    // Get email template
    const template = await getEmailTemplate();

    // Prepare template variables
    const variables = {
      familyName,
      inviterName,
      role,
      rolePermissions: getRolePermissions(role),
      invitationLink,
      expirationDate,
    };

    // Render HTML email
    const htmlBody = renderTemplate(template, variables);

    // Prepare plain text version
    const textBody = `
You're Invited to Join ${familyName}

${inviterName} has invited you to join their family on Family Inventory Management.

You'll be added as a ${role}.

To accept this invitation, visit: ${invitationLink}

This invitation expires on ${expirationDate}.

If you didn't expect this invitation, you can safely ignore this email.
    `.trim();

    // Get sender email
    const fromEmail = process.env['SES_FROM_EMAIL'] || 'noreply@inventory-mgmt.example.com';

    // Send email via SES
    const command = new SendEmailCommand({
      Source: fromEmail,
      Destination: {
        ToAddresses: [toEmail],
      },
      Message: {
        Subject: {
          Data: `You're invited to join ${familyName} on Family Inventory Management`,
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: textBody,
            Charset: 'UTF-8',
          },
          Html: {
            Data: htmlBody,
            Charset: 'UTF-8',
          },
        },
      },
    });

    const response = await sesClient.send(command);

    logger.info('Invitation email sent', {
      toEmail,
      familyName,
      role,
      messageId: response.MessageId,
    });

    return { messageId: response.MessageId || 'unknown' };
  } catch (error) {
    logger.error('Failed to send invitation email', error as Error, {
      toEmail,
      familyName,
      role,
    });
    throw new Error('Failed to send invitation email');
  }
}

/**
 * Clear cached template (useful for testing)
 */
export function clearTemplateCache(): void {
  cachedTemplate = null;
}
