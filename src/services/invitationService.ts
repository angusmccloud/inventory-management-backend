/**
 * Invitation Service - Business logic for member invitations
 * Feature: 003-member-management
 */

import { InvitationModel } from '../models/invitation';
import { MemberModel } from '../models/member';
import { generateToken } from './tokenService';
import { sendInvitationEmail } from './emailService';
import { logger } from '../lib/logger';
import {
  Invitation,
  CreateInvitationRequest,
  maskToken,
} from '../types/invitation';

/**
 * Create a new invitation and send email
 */
export async function createInvitation(
  familyId: string,
  request: CreateInvitationRequest,
  invitedByMemberId: string,
  inviterName: string,
  familyName: string
): Promise<Invitation> {
  const { email, role } = request;

  // Check for duplicate pending invitation
  const existingInvitation = await InvitationModel.findPendingByEmail(familyId, email);
  if (existingInvitation) {
    throw new Error('DUPLICATE_INVITATION');
  }

  // Check if member already exists with this email
  const members = await MemberModel.listByFamily(familyId);
  const existingMember = members.find(
    (m) => m.email.toLowerCase() === email.toLowerCase() && m.status === 'active'
  );
  if (existingMember) {
    throw new Error('MEMBER_ALREADY_EXISTS');
  }

  // Generate invitation token
  const { token, signature } = await generateToken();

  // Calculate expiration (7 days from now)
  const expirationSeconds = parseInt(
    process.env['INVITATION_EXPIRATION_SECONDS'] || '604800',
    10
  );
  const expiresAt = new Date(Date.now() + expirationSeconds * 1000).toISOString();

  // Create invitation in database
  const invitation = await InvitationModel.create({
    familyId,
    email,
    role,
    token,
    tokenSignature: signature,
    expiresAt,
    invitedBy: invitedByMemberId,
  });

  // Send invitation email
  try {
    await sendInvitationEmail({
      toEmail: email,
      familyName,
      inviterName,
      role,
      invitationToken: token,
      expiresAt,
    });

    logger.info('Invitation created and email sent', {
      invitationId: invitation.invitationId,
      email,
      role,
      maskedToken: maskToken(token),
    });
  } catch (error) {
    logger.error('Failed to send invitation email', error as Error, {
      invitationId: invitation.invitationId,
    });
    // Don't fail invitation creation if email fails
    // Admin can resend or user can use the invitation link directly
  }

  return invitation;
}

/**
 * List invitations for a family
 */
export async function listInvitations(
  familyId: string,
  status?: 'pending' | 'accepted' | 'expired' | 'revoked' | 'all'
): Promise<Invitation[]> {
  if (status === 'all') {
    return InvitationModel.listByFamily(familyId);
  }

  return InvitationModel.listByFamily(familyId, status);
}

/**
 * Get invitation by ID
 */
export async function getInvitation(
  familyId: string,
  invitationId: string
): Promise<Invitation | null> {
  return InvitationModel.getById(familyId, invitationId);
}

/**
 * Revoke a pending invitation
 */
export async function revokeInvitation(
  familyId: string,
  invitationId: string,
  revokedBy: string
): Promise<Invitation> {
  // Get invitation
  const invitation = await InvitationModel.getById(familyId, invitationId);
  if (!invitation) {
    throw new Error('INVITATION_NOT_FOUND');
  }

  // Check if invitation can be revoked
  if (invitation.status !== 'pending') {
    throw new Error('INVITATION_NOT_PENDING');
  }

  // Update status to revoked
  return InvitationModel.updateStatus(familyId, invitationId, 'revoked', { revokedBy });
}

/**
 * Validate invitation token and return invitation details
 */
export async function validateInvitationToken(token: string): Promise<{
  valid: boolean;
  invitation?: Invitation;
  reason?: string;
}> {
  // Get invitation by token
  const invitation = await InvitationModel.getByToken(token);

  if (!invitation) {
    logger.warn('Invitation not found for token', { maskedToken: maskToken(token) });
    return { valid: false, reason: 'Invitation not found' };
  }

  // Validate invitation status and expiration
  const validation = InvitationModel.validateForAcceptance(invitation);

  if (!validation.valid) {
    logger.warn('Invitation validation failed', {
      invitationId: invitation.invitationId,
      reason: validation.reason,
    });
    return { valid: false, reason: validation.reason };
  }

  return { valid: true, invitation };
}

/**
 * Accept invitation and create member
 * This is called from the acceptInvitation handler after Cognito user creation
 */
export async function acceptInvitation(
  invitation: Invitation,
  memberId: string
): Promise<void> {
  // Update invitation status to accepted
  await InvitationModel.updateStatus(invitation.familyId, invitation.invitationId, 'accepted', {
    acceptedBy: memberId,
  });

  logger.info('Invitation accepted', {
    invitationId: invitation.invitationId,
    memberId,
    email: invitation.email,
    role: invitation.role,
  });
}

