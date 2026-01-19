/**
 * Membership context utilities for pending-invite onboarding.
 */

import { MemberModel } from '../models/member';
import { FamilyModel } from '../models/family';
import type { ExistingMembershipSummary } from '../models/invitation';

const mapMemberStatus = (status: string): ExistingMembershipSummary['status'] => {
  if (status === 'active') {
    return 'ACTIVE';
  }

  return 'SUSPENDED';
};

export const getExistingMembershipSummary = async (
  memberId: string
): Promise<ExistingMembershipSummary | null> => {
  const member = await MemberModel.getByMemberId(memberId);
  if (!member) {
    return null;
  }

  const family = await FamilyModel.getById(member.familyId);
  return {
    familyId: member.familyId,
    familyName: family?.name || 'Unknown family',
    role: member.role,
    status: mapMemberStatus(member.status),
  };
};
