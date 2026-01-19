import { Frequency, NotificationPreferenceValue } from '../../types/entities';

/**
 * Default preference helpers for new members and new notification types.
 * These are intentionally lightweight and deterministic to make seeding easy.
 */

export const DEFAULT_FREQUENCY: Frequency = 'DAILY';

const FREQUENCY_VALUES: Frequency[] = ['NONE', 'IMMEDIATE', 'DAILY', 'WEEKLY'];

export function normalizePreferenceValue(value: unknown): Frequency[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is Frequency => FREQUENCY_VALUES.includes(item as Frequency) && item !== 'NONE');
  }
  if (typeof value === 'string') {
    const parts = value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    return parts.filter((item): item is Frequency => FREQUENCY_VALUES.includes(item as Frequency) && item !== 'NONE');
  }
  return [];
}

export function seedDefaultPreferences(supportedTypes: string[], channels: string[]) {
  const prefs: Record<string, Frequency[]> = {};
  for (const t of supportedTypes) {
    for (const c of channels) {
      prefs[`${t}:${c}`] = [DEFAULT_FREQUENCY];
    }
  }
  return prefs;
}

export function applyUnsubscribeAllEmail(
  preferences: Record<string, NotificationPreferenceValue> | undefined
) {
  if (!preferences) return preferences;
  const out: Record<string, Frequency[]> = {};
  for (const k of Object.keys(preferences)) {
    if (k.endsWith(':EMAIL')) {
      out[k] = [];
    } else {
      const rawValue = preferences[k];
      const normalized = normalizePreferenceValue(rawValue);
      if (rawValue === undefined || rawValue === null) {
        out[k] = [DEFAULT_FREQUENCY];
      } else {
        out[k] = normalized;
      }
    }
  }
  return out;
}
