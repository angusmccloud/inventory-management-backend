import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, getTableName } from '../../lib/dynamodb';
import { MemberModel } from '../../models/member';
import { FamilyModel } from '../../models/family';
import { isInvitationExpired } from '../../types/invitation';
import { buildIdentityKeys } from './identityMatcher';
import { buildDecisionToken } from './decisionToken';
import { getExistingMembershipSummary } from '../../lib/memberContext';
import type { InvitationItem } from '../../types/invitation';
import type { NormalizedIdentityInput } from './identityMatcher';
import type { PendingInvitation, PendingInvitationList } from '../../models/invitation';

const TABLE_NAME = getTableName();

const queryPendingInvites = async (identityKey: string): Promise<InvitationItem[]> => {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :gsi2pk AND begins_with(GSI2SK, :gsi2sk)',
      ExpressionAttributeValues: {
        ':gsi2pk': identityKey,
        ':gsi2sk': 'STATUS#PENDING#',
      },
    })
  );

  return (result.Items || []) as InvitationItem[];
};

const toPendingInvitation = (
  invite: InvitationItem,
  familyName: string,
  inviterName: string,
  requiresSwitchConfirmation: boolean
): PendingInvitation => {
  return {
    inviteId: invite.invitationId,
    familyId: invite.familyId,
    familyName,
    inviterName,
    roleOffered: invite.role,
    expiresAt: invite.expiresAt,
    status: invite.status === 'pending' ? 'PENDING' : 'EXPIRED',
    requiresSwitchConfirmation,
  };
};

export const getPendingInvitationList = async (
  memberId: string,
  identity: NormalizedIdentityInput
): Promise<PendingInvitationList> => {
  const identityKeys = buildIdentityKeys(identity);
  const inviteMap = new Map<string, InvitationItem>();

  for (const key of identityKeys) {
    const invites = await queryPendingInvites(key);
    invites.forEach((invite) => inviteMap.set(invite.invitationId, invite));
  }

  const existingMembership = await getExistingMembershipSummary(memberId);

  const familyNameCache = new Map<string, string>();
  const inviterNameCache = new Map<string, string>();

  const pendingInvites: PendingInvitation[] = [];

  for (const invite of inviteMap.values()) {
    if (invite.status !== 'pending' || isInvitationExpired(invite)) {
      continue;
    }

    let familyName = familyNameCache.get(invite.familyId);
    if (!familyName) {
      const family = await FamilyModel.getById(invite.familyId);
      familyName = family?.name || 'Unknown family';
      familyNameCache.set(invite.familyId, familyName);
    }

    let inviterName = inviterNameCache.get(invite.invitedBy);
    if (!inviterName) {
      const inviter = await MemberModel.getById(invite.familyId, invite.invitedBy);
      inviterName = inviter?.name || 'Family member';
      inviterNameCache.set(invite.invitedBy, inviterName);
    }

    const requiresSwitchConfirmation =
      !!existingMembership && existingMembership.familyId !== invite.familyId;

    pendingInvites.push(
      toPendingInvitation(invite, familyName, inviterName, requiresSwitchConfirmation)
    );
  }

  pendingInvites.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));

  return {
    invites: pendingInvites,
    existingMembership: existingMembership || undefined,
    decisionToken: buildDecisionToken(memberId),
  };
};
