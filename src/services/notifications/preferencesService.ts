import { MemberModel } from '../../models/member';
import {
  seedDefaultPreferences,
  DEFAULT_FREQUENCY,
  applyUnsubscribeAllEmail,
  normalizePreferenceValue,
} from './defaults';
import { Frequency, NotificationPreferenceValue } from '../../types/entities';

type PreferenceEntry = { channel: string; frequency: Frequency | Frequency[] };
type NotificationPreference = { notificationType: string; entries: PreferenceEntry[] };

const SUPPORTED_NOTIFICATION_TYPES = ['LOW_STOCK', 'SUGGESTION'];
const SUPPORTED_CHANNELS = ['EMAIL', 'IN_APP'];

export async function getPreferences(familyId: string, memberId: string) {
  const member = await MemberModel.getById(familyId, memberId);
  if (!member) throw new Error('Member not found');

  const rawPrefs: Record<string, NotificationPreferenceValue> =
    member.notificationPreferences ?? seedDefaultPreferences(SUPPORTED_NOTIFICATION_TYPES, SUPPORTED_CHANNELS);

  const prefsMap: Record<string, Record<string, Frequency[]>> = {};

  for (const k of Object.keys(rawPrefs)) {
    const parts = k.split(':');
    const type = parts[0] ?? 'UNKNOWN';
    const channel = parts[1] ?? 'UNKNOWN';
    if (!prefsMap[type]) prefsMap[type] = {};
    const rawValue = rawPrefs[k];
    const normalized = normalizePreferenceValue(rawValue);
    if (member.unsubscribeAllEmail && channel === 'EMAIL') {
      prefsMap[type][channel] = [];
    } else if (rawValue === undefined || rawValue === null) {
      prefsMap[type][channel] = [DEFAULT_FREQUENCY];
    } else {
      prefsMap[type][channel] = normalized;
    }
  }

  const preferences: NotificationPreference[] = Object.keys(prefsMap).map((type) => ({
    notificationType: type,
    entries: Object.keys(prefsMap[type] || {}).map((channel) => {
      const freq = prefsMap[type]?.[channel] ?? [DEFAULT_FREQUENCY];
      return { channel, frequency: freq };
    }),
  }));

  return {
    data: {
      preferences,
      defaultFrequency: DEFAULT_FREQUENCY,
      unsubscribeAllEmail: !!member.unsubscribeAllEmail,
      timezone: member.timezone ?? 'UTC',
      lastUpdatedAt: member.updatedAt,
    },
  };
}

export async function updatePreferences(
  familyId: string,
  memberId: string,
  preferences: NotificationPreference[],
  unsubscribeAllEmail: boolean | undefined,
  expectedVersion?: number
) {
  const prefsMap: Record<string, Frequency[]> = {};
  for (const p of preferences) {
    for (const e of p.entries) {
      const rawValue = e.frequency;
      const normalized = normalizePreferenceValue(rawValue);
      prefsMap[`${p.notificationType}:${e.channel}`] =
        rawValue === undefined || rawValue === null ? [DEFAULT_FREQUENCY] : normalized;
    }
  }

  let finalPrefs = prefsMap;
  if (unsubscribeAllEmail) {
    finalPrefs = applyUnsubscribeAllEmail(finalPrefs) as Record<string, Frequency[]>;
  }

  if (expectedVersion !== undefined) {
    const updated = await MemberModel.updateWithVersion(familyId, memberId, { notificationPreferences: finalPrefs, unsubscribeAllEmail }, expectedVersion);
    return updated;
  }

  const updated = await MemberModel.update(familyId, memberId, { notificationPreferences: finalPrefs, unsubscribeAllEmail });
  return updated;
}

export default { getPreferences, updatePreferences };
