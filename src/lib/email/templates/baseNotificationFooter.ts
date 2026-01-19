/**
 * Base notification footer template fragment. Kept minimal for now.
 * Real templates should be assembled with the existing email templating system.
 */

export function baseNotificationFooter(unsubscribeUrl?: string, preferencesUrl?: string) {
  const footerLink = unsubscribeUrl || preferencesUrl;
  if (!footerLink) {
    return '--';
  }
  return ['--', `Manage your email preferences or unsubscribe: ${footerLink}`].join('\n');
}

export default baseNotificationFooter;
