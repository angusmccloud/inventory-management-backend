import { jest } from '@jest/globals';
import * as PreferencesService from '../../../../src/services/notifications/preferencesService';
import { MemberModel } from '../../../../src/models/member';

describe('preferencesService', () => {
  const familyId = 'family-1';
  const memberId = 'member-1';

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('returns seeded defaults when no member preferences exist', async () => {
    jest.spyOn(MemberModel, 'getById' as any).mockResolvedValue({
      memberId,
      familyId,
      notificationPreferences: undefined,
      unsubscribeAllEmail: false,
      timezone: 'UTC',
      updatedAt: new Date().toISOString(),
    } as any);

    const res = await PreferencesService.getPreferences(familyId, memberId);
    expect(res).toHaveProperty('data');
    expect(res.data).toHaveProperty('preferences');
    expect(Array.isArray(res.data.preferences)).toBe(true);
  });

  it('updates preferences on member record', async () => {
    const updatedMock = { notificationPreferences: { 'LOW_STOCK:EMAIL': 'NONE' } } as any;
    jest.spyOn(MemberModel, 'update' as any).mockResolvedValue(updatedMock);

    const pref = [{ notificationType: 'LOW_STOCK', entries: [{ channel: 'EMAIL', frequency: 'NONE' }] }];
    const updated = await PreferencesService.updatePreferences(familyId, memberId, pref, true);
    expect(updated).toBeDefined();
    expect((updated as any).notificationPreferences['LOW_STOCK:EMAIL']).toBe('NONE');
  });
});
