/**
 * Update Member Handler
 * PATCH /families/{familyId}/members/{memberId}
 * Feature: 003-member-management
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { logger } from '../../lib/logger';
import { successResponse, errorResponse } from '../../lib/response';
import { getAuthContext, requireAdmin, verifyFamilyAccess } from '../../lib/authorization';
import { updateMemberRole, updateMemberName, getMember } from '../../services/memberService';
import { MemberRoleSchema } from '../../types/invitation';

const UpdateMemberRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: MemberRoleSchema.optional(),
  version: z.number().int().min(1),
});

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Get auth context
    const authContext = getAuthContext(event);

    // Require admin role
    const authError = requireAdmin(authContext);
    if (authError) return authError;

    // Get familyId and memberId from path
    const familyId = event.pathParameters?.['familyId'];
    const memberId = event.pathParameters?.['memberId'];

    if (!familyId || !memberId) {
      return errorResponse(400, 'BadRequest', 'Missing familyId or memberId in path');
    }

    // Verify family access
    const accessError = verifyFamilyAccess(authContext!, familyId);
    if (accessError) return accessError;

    // Parse and validate request body
    const body = JSON.parse(event.body || '{}');
    const validationResult = UpdateMemberRequestSchema.safeParse(body);

    if (!validationResult.success) {
      logger.warn('Invalid update member request', { errors: validationResult.error.errors });
      return errorResponse(400, 'BadRequest', 'Invalid request body', validationResult.error.errors);
    }

    const { name, role, version } = validationResult.data;

    // Must update at least one field
    if (!name && !role) {
      return errorResponse(400, 'BadRequest', 'Must provide name or role to update');
    }

    try {
      let updatedMember;

      if (role && !name) {
        // Update role only
        updatedMember = await updateMemberRole(familyId, memberId, role, version);
      } else if (name && !role) {
        // Update name only
        updatedMember = await updateMemberName(familyId, memberId, name, version);
      } else if (name && role) {
        // Update role first, then name
        updatedMember = await updateMemberRole(familyId, memberId, role, version);
        // Name update with incremented version
        updatedMember = await updateMemberName(familyId, memberId, name, version + 1);
      }

      logger.info('Member updated', {
        familyId,
        memberId,
        updates: { name, role },
      });

      return successResponse(200, updatedMember);
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (errorMessage === 'MEMBER_NOT_FOUND') {
        return errorResponse(404, 'NotFound', 'Member not found');
      }

      if (errorMessage === 'MEMBER_NOT_ACTIVE') {
        return errorResponse(400, 'BadRequest', 'Cannot update removed member');
      }

      if (errorMessage === 'LAST_ADMIN_PROTECTION') {
        return errorResponse(400, 'BadRequest', 'Cannot change role of the last admin. At least one admin must exist.');
      }

      if (errorMessage === 'VERSION_CONFLICT') {
        // Get current member state
        const currentMember = await getMember(familyId, memberId);
        return errorResponse(409, 'Conflict', 'Member was modified by another user. Please refresh and try again.', undefined, {
          currentState: currentMember,
        });
      }

      throw error;
    }
  } catch (error) {
    logger.error('Failed to update member', error as Error, {
      path: event.path,
      familyId: event.pathParameters?.['familyId'],
      memberId: event.pathParameters?.['memberId'],
    });
    return errorResponse(500, 'InternalServerError', 'Failed to update member');
  }
}

