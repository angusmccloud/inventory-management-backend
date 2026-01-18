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
}

export function buildNotificationEmail(args: NotificationTemplateArgs) {
  const { title, message, unsubscribeUrl, preferencesUrl } = args;
  const subject = title;

  const textLines = [message, '', baseNotificationFooter(unsubscribeUrl, preferencesUrl)];
  const text = textLines.filter(Boolean).join('\n\n');

  const htmlFooterParts: string[] = [];
  if (unsubscribeUrl) htmlFooterParts.push(`<p><a href="${unsubscribeUrl}">Unsubscribe</a></p>`);
  if (preferencesUrl) htmlFooterParts.push(`<p><a href="${preferencesUrl}">Manage notification preferences</a></p>`);

  const html = `
    <html>
      <body style="font-family: Arial, Helvetica, sans-serif; line-height:1.4; color:#111;">
        <h2 style="margin-bottom:0.25rem;">${escapeHtml(title)}</h2>
        <div style="margin:0.5rem 0;">${escapeHtml(message).replace(/\n/g, '<br/>')}</div>
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
