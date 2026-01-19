/**
 * Simple notification email template builder.
 * Produces subject, plain-text and HTML bodies. Keep templates small and safe.
 */
import { baseNotificationFooter } from './baseNotificationFooter';

export interface NotificationTemplateArgs {
  title: string;
  message: string;
  unsubscribeUrl?: string;
  preferencesUrl?: string;
  actionLinks?: Array<{ label: string; url: string }>;
}

export function buildNotificationEmail(args: NotificationTemplateArgs) {
  const { title, message, unsubscribeUrl, preferencesUrl, actionLinks } = args;
  const subject = title;

  const textLines = [message, ''];
  if (actionLinks && actionLinks.length > 0) {
    textLines.push('Add it to your Shopping List or Inventory to dismiss notification.');
    textLines.push('');
  }
  textLines.push(baseNotificationFooter(unsubscribeUrl, preferencesUrl));
  const text = textLines.filter(Boolean).join('\n\n');

  const htmlFooterParts: string[] = [];
  const footerLink = unsubscribeUrl || preferencesUrl;
  if (footerLink) {
    htmlFooterParts.push(
      `<p><a href="${footerLink}">Manage your email preferences or unsubscribe</a></p>`
    );
  }

  const htmlActionLinks =
    actionLinks && actionLinks.length > 0
      ? `<p>Add it to your ${actionLinks
          .map((link) => `<a href="${link.url}">${escapeHtml(link.label)}</a>`)
          .join(' or ')} to dismiss notification.</p>`
      : '';

  const html = `
    <html>
      <body style="font-family: Arial, Helvetica, sans-serif; line-height:1.4; color:#111;">
        <h2 style="margin-bottom:0.25rem;">${escapeHtml(title)}</h2>
        <div style="margin:0.5rem 0;">${escapeHtml(message).replace(/\n/g, '<br/>')}</div>
        ${htmlActionLinks}
        <hr/>
        <div style="font-size:0.9rem; color:#666;">${htmlFooterParts.join('')}</div>
      </body>
    </html>
  `;

  return { subject, text, html };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default buildNotificationEmail;
