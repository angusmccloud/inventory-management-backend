/**
 * Type definitions for the Invitation entity
 * Feature: 003-member-management
 */

import { z } from 'zod';

// ============================================
// Invitation Status
// ============================================
export const InvitationStatusSchema = z.enum(['pending', 'accepted', 'expired', 'revoked', 'declined']);
export type InvitationStatus = z.infer<typeof InvitationStatusSchema>;

// ============================================
// Member Role
// ============================================
export const MemberRoleSchema = z.enum(['admin', 'suggester']);
export type MemberRole = z.infer<typeof MemberRoleSchema>;

// ============================================
// Invitation Entity
// ============================================
export const InvitationSchema = z.object({
  // Primary identifiers
  invitationId: z.string().uuid(),
  familyId: z.string().uuid(),
  
  // Invitation details
  email: z.string().email().max(254),
  role: MemberRoleSchema,
  token: z.string().min(90).max(110), // UUID.HMAC format
  tokenSignature: z.string().length(64), // HMAC-SHA256 hex
  status: InvitationStatusSchema,
  
  // Expiration
  expiresAt: z.string().datetime(),
  ttl: z.number().int().positive(),
  
  // Audit fields
  invitedBy: z.string().uuid(),
  acceptedBy: z.string().uuid().nullable(),
  acceptedAt: z.string().datetime().nullable(),
  revokedBy: z.string().uuid().nullable(),
  revokedAt: z.string().datetime().nullable(),
  declineReason: z.string().max(280).nullable().optional(),
  decisionSource: z.enum(['link', 'pending-detection']).optional(),
  lastDecisionId: z.string().uuid().nullable().optional(),
  consumedAt: z.string().datetime().nullable().optional(),
  
  // Standard fields
  entityType: z.literal('Invitation'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Invitation = z.infer<typeof InvitationSchema>;

// ============================================
// Create Invitation Request
// ============================================
export const CreateInvitationRequestSchema = z.object({
  email: z.string().email().max(254),
  role: MemberRoleSchema,
});

export type CreateInvitationRequest = z.infer<typeof CreateInvitationRequestSchema>;

// ============================================
// Accept Invitation Request
// ============================================
export const AcceptInvitationRequestSchema = z.object({
  token: z.string().min(90).max(110),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(128).optional(),
});

export type AcceptInvitationRequest = z.infer<typeof AcceptInvitationRequestSchema>;

// ============================================
// DynamoDB Key Schemas
// ============================================
export const InvitationKeysSchema = z.object({
  PK: z.string().regex(/^FAMILY#[0-9a-f-]{36}$/),
  SK: z.string().regex(/^INVITATION#[0-9a-f-]{36}$/),
  GSI1PK: z.string().regex(/^INVITATION_TOKEN#.+$/),
  GSI1SK: z.string().regex(/^INVITATION#[0-9a-f-]{36}$/),
  GSI2PK: z.string().regex(/^IDENTITY#.+$/).optional(),
  GSI2SK: z.string().regex(/^STATUS#[A-Z]+#(EXPIRES|UPDATED)#.+#INVITE#.+$/).optional(),
});

export type InvitationKeys = z.infer<typeof InvitationKeysSchema>;

// ============================================
// Invitation with DynamoDB keys
// ============================================
export type InvitationItem = Invitation & InvitationKeys;

// ============================================
// Helper Functions
// ============================================

/**
 * Generate DynamoDB keys for an invitation
 */
export function generateInvitationKeys(familyId: string, invitationId: string, token: string): InvitationKeys {
  return {
    PK: `FAMILY#${familyId}`,
    SK: `INVITATION#${invitationId}`,
    GSI1PK: `INVITATION_TOKEN#${token}`,
    GSI1SK: `INVITATION#${invitationId}`,
  };
}

/**
 * Check if an invitation is expired
 */
export function isInvitationExpired(invitation: Invitation): boolean {
  return new Date(invitation.expiresAt) < new Date();
}

/**
 * Check if an invitation is valid for acceptance
 */
export function isInvitationValid(invitation: Invitation): boolean {
  return invitation.status === 'pending' && !isInvitationExpired(invitation);
}

/**
 * Mask token for logging (only show first 8 characters)
 */
export function maskToken(token: string): string {
  const parts = token.split('.');
  if (parts.length !== 2) return '***';
  const uuid = parts[0];
  if (!uuid) return '***';
  return `${uuid.substring(0, 8)}...`;
}
