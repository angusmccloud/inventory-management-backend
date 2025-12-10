/**
 * Remove Member Handler
 * DELETE /families/{familyId}/members/{memberId}
 * Feature: 003-member-management
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { logger } from '../../lib/logger';
import { successResponse, errorResponse } from '../../lib/response';
import { getAuthContext, requireAdmin, verifyFamilyAccess } from '../../lib/authorization';
import { removeMember, getMember } from '../../services/memberService';

const RemoveMemberRequestSchema = z.object({
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
    const validationResult = RemoveMemberRequestSchema.safeParse(body);

    if (!validationResult.success) {
      logger.warn('Invalid remove member request', { errors: validationResult.error.errors });
      return errorResponse(400, 'BadRequest', 'Invalid request body', validationResult.error.errors);
    }

    const { version } = validationResult.data;

    // Remove member
    try {
      await removeMember(familyId, memberId, version, authContext!.memberId);

      logger.info('Member removed', {
        familyId,
        memberId,
        removedBy: authContext!.memberId,
        wasSelfRemoval: memberId === authContext!.memberId,
      });

      return successResponse(204, null);
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (errorMessage === 'MEMBER_NOT_FOUND') {
        return errorResponse(404, 'NotFound', 'Member not found');
      }

      if (errorMessage === 'MEMBER_ALREADY_REMOVED') {
        return errorResponse(400, 'BadRequest', 'Member has already been removed');
      }

      if (errorMessage === 'LAST_ADMIN_PROTECTION') {
        return errorResponse(400, 'BadRequest', 'Cannot remove the last admin. At least one admin must exist.');
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
    logger.error('Failed to remove member', error as Error, {
      path: event.path,
      familyId: event.pathParameters?.['familyId'],
      memberId: event.pathParameters?.['memberId'],
    });
    return errorResponse(500, 'InternalServerError', 'Failed to remove member');
  }
}

