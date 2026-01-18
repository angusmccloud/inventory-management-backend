/**
 * Base notification footer template fragment. Kept minimal for now.
 * Real templates should be assembled with the existing email templating system.
 */

export function baseNotificationFooter(unsubscribeUrl?: string, preferencesUrl?: string) {
  const unsubscribeLink = unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : '';
  const prefsLink = preferencesUrl ? `Manage preferences: ${preferencesUrl}` : '';
  return [`--`, unsubscribeLink, prefsLink].filter(Boolean).join('\n');
}

export default baseNotificationFooter;
