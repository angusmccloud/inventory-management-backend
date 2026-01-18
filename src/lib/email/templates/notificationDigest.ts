/**
 * Notification Digest Email Template
 *
 * Generates daily/weekly digest emails with outstanding notifications
 * grouped by type, with compliance links (unsubscribe/preferences).
 */

import { baseNotificationFooter } from './baseNotificationFooter';

export interface DigestNotification {
  notificationId: string;
  type: string;
  message: string;
  createdAt: string;
  itemName?: string;
  resolveUrl?: string;
}

export interface DigestTemplateArgs {
  recipientName: string;
  digestType: 'daily' | 'weekly';
  notifications: DigestNotification[];
  unsubscribeUrl?: string;
  preferencesUrl?: string;
  dashboardUrl?: string;
}

function formatNotificationType(type: string): string {
  switch (type) {
    case 'LOW_STOCK':
      return 'Low Stock Alert';
    case 'SUGGESTION':
      return 'Suggestion';
    default:
      return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return '1 week ago';
  return `${Math.floor(diffDays / 7)} weeks ago`;
}

function groupNotificationsByType(
  notifications: DigestNotification[]
): Record<string, DigestNotification[]> {
  const grouped: Record<string, DigestNotification[]> = {};
  for (const n of notifications) {
    const key = n.type;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(n);
  }
  return grouped;
}

export function buildDigestEmail(args: DigestTemplateArgs): {
  subject: string;
  text: string;
  html: string;
} {
  const { recipientName, digestType, notifications, unsubscribeUrl, preferencesUrl, dashboardUrl } =
    args;

  const periodLabel = digestType === 'daily' ? 'Daily' : 'Weekly';
  const subject =
    notifications.length > 0
      ? `Your ${periodLabel} Inventory Summary - ${notifications.length} item${notifications.length !== 1 ? 's' : ''} need attention`
      : `Your ${periodLabel} Inventory Summary - All clear!`;

  // Text version
  const textLines: string[] = [
    `Hi ${recipientName},`,
    '',
    notifications.length > 0
      ? `You have ${notifications.length} outstanding notification${notifications.length !== 1 ? 's' : ''} that need your attention.`
      : 'Great news! You have no outstanding notifications.',
    '',
  ];

  if (notifications.length > 0) {
    const grouped = groupNotificationsByType(notifications);
    for (const [type, items] of Object.entries(grouped)) {
      textLines.push(`--- ${formatNotificationType(type)} (${items.length}) ---`);
      for (const item of items) {
        const age = formatRelativeDate(item.createdAt);
        textLines.push(`  • ${item.itemName || item.message} (${age})`);
      }
      textLines.push('');
    }

    // Find oldest notification
    const oldest = notifications.reduce((a, b) =>
      new Date(a.createdAt) < new Date(b.createdAt) ? a : b
    );
    textLines.push(`⚠️ Oldest alert: ${formatRelativeDate(oldest.createdAt)}`);
    textLines.push('');
  }

  if (dashboardUrl) {
    textLines.push(`View all notifications: ${dashboardUrl}`);
    textLines.push('');
  }

  textLines.push(baseNotificationFooter(unsubscribeUrl, preferencesUrl));

  const text = textLines.join('\n');

  // HTML version
  const htmlNotifications =
    notifications.length > 0
      ? (() => {
          const grouped = groupNotificationsByType(notifications);
          let html = '';
          for (const [type, items] of Object.entries(grouped)) {
            html += `
          <div style="margin-bottom: 1.5rem;">
            <h3 style="color: #374151; margin-bottom: 0.5rem; font-size: 1rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.25rem;">
              ${escapeHtml(formatNotificationType(type))} (${items.length})
            </h3>
            <ul style="margin: 0; padding-left: 1.25rem;">
              ${items
                .map(
                  (item) => `
                <li style="margin-bottom: 0.5rem; color: #4b5563;">
                  <strong>${escapeHtml(item.itemName || item.message)}</strong>
                  <span style="color: #9ca3af; font-size: 0.875rem;"> — ${formatRelativeDate(item.createdAt)}</span>
                </li>
              `
                )
                .join('')}
            </ul>
          </div>
        `;
          }
          return html;
        })()
      : '<p style="color: #059669; font-weight: 500;">✓ All clear! No outstanding notifications.</p>';

  const oldestWarning =
    notifications.length > 0
      ? (() => {
          const oldest = notifications.reduce((a, b) =>
            new Date(a.createdAt) < new Date(b.createdAt) ? a : b
          );
          return `<p style="background: #fef3c7; padding: 0.75rem; border-radius: 0.375rem; color: #92400e; margin-top: 1rem;">
        ⚠️ <strong>Oldest alert:</strong> ${formatRelativeDate(oldest.createdAt)}
      </p>`;
        })()
      : '';

  const dashboardLink = dashboardUrl
    ? `<p style="margin-top: 1rem;"><a href="${dashboardUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 0.75rem 1.5rem; border-radius: 0.375rem; text-decoration: none; font-weight: 500;">View All Notifications</a></p>`
    : '';

  const htmlFooterParts: string[] = [];
  if (unsubscribeUrl)
    htmlFooterParts.push(`<a href="${unsubscribeUrl}" style="color: #6b7280;">Unsubscribe</a>`);
  if (preferencesUrl)
    htmlFooterParts.push(
      `<a href="${preferencesUrl}" style="color: #6b7280;">Manage notification preferences</a>`
    );

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.5; color: #111827; max-width: 600px; margin: 0 auto; padding: 1rem;">
  <div style="border-bottom: 2px solid #2563eb; padding-bottom: 0.5rem; margin-bottom: 1.5rem;">
    <h1 style="margin: 0; color: #1f2937; font-size: 1.25rem;">${periodLabel} Inventory Summary</h1>
  </div>

  <p style="color: #4b5563; margin-bottom: 1rem;">Hi ${escapeHtml(recipientName)},</p>

  <p style="color: #4b5563; margin-bottom: 1.5rem;">
    ${
      notifications.length > 0
        ? `You have <strong>${notifications.length}</strong> outstanding notification${notifications.length !== 1 ? 's' : ''} that need your attention.`
        : 'Great news! You have no outstanding notifications.'
    }
  </p>

  ${htmlNotifications}
  ${oldestWarning}
  ${dashboardLink}

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 2rem 0 1rem;">

  <div style="font-size: 0.75rem; color: #9ca3af;">
    ${htmlFooterParts.join(' | ')}
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default buildDigestEmail;
