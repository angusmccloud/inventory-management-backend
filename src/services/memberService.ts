/**
 * Member Service - Business logic for family member management
 * Feature: 003-member-management
 */

import { MemberModel } from '../models/member';
import {
  CognitoIdentityProviderClient,
  AdminUserGlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { logger } from '../lib/logger';
import { Member, MemberRole } from '../types/entities';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env['AWS_REGION'] || 'us-east-1',
});

/**
 * List members in a family
 */
export async function listMembers(
  familyId: string,
  includeRemoved = false
): Promise<Member[]> {
  const allMembers = await MemberModel.listByFamily(familyId);

  if (includeRemoved) {
    return allMembers;
  }

  return allMembers.filter((m) => m.status === 'active');
}

/**
 * Get member by ID
 */
export async function getMember(
  familyId: string,
  memberId: string
): Promise<Member | null> {
  return MemberModel.getById(familyId, memberId);
}

/**
 * Update member role with last admin protection and optimistic locking
 */
export async function updateMemberRole(
  familyId: string,
  memberId: string,
  newRole: MemberRole,
  expectedVersion: number
): Promise<Member> {
  // Get current member state
  const member = await MemberModel.getById(familyId, memberId);
  if (!member) {
    throw new Error('MEMBER_NOT_FOUND');
  }

  // Check if member is active
  if (member.status !== 'active') {
    throw new Error('MEMBER_NOT_ACTIVE');
  }

  // Last admin protection: cannot change last admin to suggester
  if (member.role === 'admin' && newRole === 'suggester') {
    const adminCount = await MemberModel.countAdmins(familyId);
    if (adminCount <= 1) {
      throw new Error('LAST_ADMIN_PROTECTION');
    }
  }

  // Update with optimistic locking
  try {
    return await MemberModel.updateWithVersion(familyId, memberId, { role: newRole }, expectedVersion);
  } catch (error) {
    if ((error as Error).message === 'VERSION_CONFLICT') {
      // Re-throw with specific error code
      throw new Error('VERSION_CONFLICT');
    }
    throw error;
  }
}

/**
 * Update member name with optimistic locking
 */
export async function updateMemberName(
  familyId: string,
  memberId: string,
  newName: string,
  expectedVersion: number
): Promise<Member> {
  // Get current member state
  const member = await MemberModel.getById(familyId, memberId);
  if (!member) {
    throw new Error('MEMBER_NOT_FOUND');
  }

  // Update with optimistic locking
  try {
    return await MemberModel.updateWithVersion(familyId, memberId, { name: newName }, expectedVersion);
  } catch (error) {
    if ((error as Error).message === 'VERSION_CONFLICT') {
      throw new Error('VERSION_CONFLICT');
    }
    throw error;
  }
}

/**
 * Remove member with last admin protection and optimistic locking
 */
export async function removeMember(
  familyId: string,
  memberId: string,
  expectedVersion: number,
  requestingMemberId: string
): Promise<void> {
  // Get member to remove
  const member = await MemberModel.getById(familyId, memberId);
  if (!member) {
    throw new Error('MEMBER_NOT_FOUND');
  }

  // Check if member is already removed
  if (member.status === 'removed') {
    throw new Error('MEMBER_ALREADY_REMOVED');
  }

  // Last admin protection: cannot remove last admin
  if (member.role === 'admin') {
    const adminCount = await MemberModel.countAdmins(familyId);
    if (adminCount <= 1) {
      throw new Error('LAST_ADMIN_PROTECTION');
    }
  }

  // Remove member (soft delete)
  try {
    await MemberModel.updateWithVersion(
      familyId,
      memberId,
      { status: 'removed' },
      expectedVersion
    );

    logger.info('Member removed', {
      familyId,
      memberId,
      removedBy: requestingMemberId,
      wasSelfRemoval: memberId === requestingMemberId,
    });

    // If self-removal, invalidate user's Cognito session
    if (memberId === requestingMemberId) {
      await invalidateMemberSession(member.email);
    }
  } catch (error) {
    if ((error as Error).message === 'VERSION_CONFLICT') {
      throw new Error('VERSION_CONFLICT');
    }
    throw error;
  }
}

/**
 * Invalidate member's Cognito session (global sign out)
 */
async function invalidateMemberSession(email: string): Promise<void> {
  try {
    const userPoolId = process.env['COGNITO_USER_POOL_ID'];
    if (!userPoolId) {
      logger.warn('COGNITO_USER_POOL_ID not set, skipping session invalidation');
      return;
    }

    await cognitoClient.send(
      new AdminUserGlobalSignOutCommand({
        UserPoolId: userPoolId,
        Username: email,
      })
    );

    logger.info('Member session invalidated', { email });
  } catch (error) {
    // Don't fail removal if session invalidation fails
    logger.error('Failed to invalidate member session', error as Error, { email });
  }
}

/**
 * Count active admin members (utility function)
 */
export async function countActiveAdmins(familyId: string): Promise<number> {
  return MemberModel.countAdmins(familyId);
}

/**
 * Check if user has admin role in family
 */
export async function isAdmin(familyId: string, memberId: string): Promise<boolean> {
  const member = await MemberModel.getById(familyId, memberId);
  return member !== null && member.role === 'admin' && member.status === 'active';
}

/**
 * Check if user is a member of family
 */
export async function isMember(familyId: string, memberId: string): Promise<boolean> {
  const member = await MemberModel.getById(familyId, memberId);
  return member !== null && member.status === 'active';
}

