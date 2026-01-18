import { Frequency } from '../../types/entities';

/**
 * Default preference helpers for new members and new notification types.
 * These are intentionally lightweight and deterministic to make seeding easy.
 */

export const DEFAULT_FREQUENCY: Frequency = 'DAILY';

export function seedDefaultPreferences(supportedTypes: string[], channels: string[]) {
  const prefs: Record<string, Frequency> = {};
  for (const t of supportedTypes) {
    for (const c of channels) {
      prefs[`${t}:${c}`] = DEFAULT_FREQUENCY;
    }
  }
  return prefs;
}

export function applyUnsubscribeAllEmail(preferences: Record<string, Frequency> | undefined) {
  if (!preferences) return preferences;
  const out: Record<string, Frequency> = {};
  for (const k of Object.keys(preferences)) {
    if (k.endsWith(':EMAIL')) {
      out[k] = 'NONE';
    } else {
      out[k] = preferences[k] ?? DEFAULT_FREQUENCY;
    }
  }
  return out;
}
