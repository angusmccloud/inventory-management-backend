/**
 * EmailService - Family Inventory Management System
 *
 * AWS SES integration for sending notification emails.
 * For local development, logs emails instead of sending them.
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { logger } from '../lib/logger';

const sesClient = new SESClient({});

/**
 * Environment configuration
 */
const SES_FROM_EMAIL = process.env['SES_FROM_EMAIL'] || 'noreply@example.com';
const IS_LOCAL = process.env['AWS_SAM_LOCAL'] === 'true' || process.env['NODE_ENV'] === 'development';

/**
 * Low-stock alert email data
 */
export interface LowStockAlertEmailData {
  itemName: string;
  currentQuantity: number;
  threshold: number;
  familyName: string;
}

/**
 * Email recipient
 */
export interface EmailRecipient {
  email: string;
  name?: string;
}

/**
 * Email send result
 */
export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Generate HTML content for low-stock alert email
 */
const generateLowStockEmailHtml = (data: LowStockAlertEmailData): string => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Low Stock Alert</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background-color: #f8d7da;
      border: 1px solid #f5c6cb;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .header h1 {
      color: #721c24;
      margin: 0 0 10px 0;
      font-size: 24px;
    }
    .content {
      background-color: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .item-name {
      font-size: 20px;
      font-weight: bold;
      color: #495057;
      margin-bottom: 15px;
    }
    .quantity-info {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .quantity-label {
      color: #6c757d;
    }
    .quantity-value {
      font-weight: bold;
    }
    .quantity-value.low {
      color: #dc3545;
    }
    .quantity-value.threshold {
      color: #ffc107;
    }
    .footer {
      text-align: center;
      color: #6c757d;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>⚠️ Low Stock Alert</h1>
    <p>An item in your family inventory is running low.</p>
  </div>
  
  <div class="content">
    <div class="item-name">${escapeHtml(data.itemName)}</div>
    
    <div class="quantity-info">
      <span class="quantity-label">Current Quantity:</span>
      <span class="quantity-value low">${data.currentQuantity}</span>
    </div>
    
    <div class="quantity-info">
      <span class="quantity-label">Low Stock Threshold:</span>
      <span class="quantity-value threshold">${data.threshold}</span>
    </div>
    
    <p>Please consider restocking this item soon.</p>
  </div>
  
  <div class="footer">
    <p>This notification was sent from ${escapeHtml(data.familyName)}'s Family Inventory.</p>
    <p>You received this email because you are an admin of this family.</p>
  </div>
</body>
</html>
  `.trim();
};

/**
 * Generate plain text content for low-stock alert email
 */
const generateLowStockEmailText = (data: LowStockAlertEmailData): string => {
  return `
LOW STOCK ALERT

An item in your family inventory is running low.

Item: ${data.itemName}
Current Quantity: ${data.currentQuantity}
Low Stock Threshold: ${data.threshold}

Please consider restocking this item soon.

---
This notification was sent from ${data.familyName}'s Family Inventory.
You received this email because you are an admin of this family.
  `.trim();
};

/**
 * Escape HTML special characters
 */
const escapeHtml = (text: string): string => {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char] || char);
};

/**
 * EmailService
 * Handles sending emails via AWS SES
 */
export class EmailService {
  /**
   * Send a low-stock alert email
   * In local development, logs the email instead of sending
   */
  static async sendLowStockAlert(
    recipients: EmailRecipient[],
    data: LowStockAlertEmailData
  ): Promise<EmailSendResult[]> {
    const results: EmailSendResult[] = [];

    for (const recipient of recipients) {
      try {
        const result = await this.sendEmail(
          recipient.email,
          `Low Stock Alert: ${data.itemName}`,
          generateLowStockEmailText(data),
          generateLowStockEmailHtml(data)
        );
        results.push(result);
      } catch (error) {
        logger.error('Failed to send low-stock alert email', error as Error, {
          recipient: recipient.email,
          itemName: data.itemName,
        });
        results.push({
          success: false,
          error: (error as Error).message,
        });
      }
    }

    return results;
  }

  /**
   * Send an email via SES or log it in local development
   */
  static async sendEmail(
    to: string,
    subject: string,
    textBody: string,
    htmlBody: string
  ): Promise<EmailSendResult> {
    // In local development, log the email instead of sending
    if (IS_LOCAL) {
      logger.info('Email would be sent (local development mode)', {
        to,
        from: SES_FROM_EMAIL,
        subject,
        textBodyPreview: textBody.substring(0, 200) + '...',
      });

      return {
        success: true,
        messageId: `local-${Date.now()}`,
      };
    }

    try {
      const command = new SendEmailCommand({
        Source: SES_FROM_EMAIL,
        Destination: {
          ToAddresses: [to],
        },
        Message: {
          Subject: {
            Data: subject,
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

      logger.info('Email sent successfully', {
        to,
        subject,
        messageId: response.MessageId,
      });

      return {
        success: true,
        messageId: response.MessageId,
      };
    } catch (error) {
      logger.error('Failed to send email via SES', error as Error, {
        to,
        subject,
      });

      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}