/**
 * Resend Invitation Handler
 * POST /families/{familyId}/invitations/{invitationId}/resend
 * Feature: 003-member-management
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { logger } from '../../lib/logger';
import { successResponse, errorResponse } from '../../lib/response';
import { getAuthContext, requireAdmin, verifyFamilyAccess } from '../../lib/authorization';
import { resendInvitation } from '../../services/invitationService';
import { getMember } from '../../services/memberService';
import { FamilyModel } from '../../models/family';
import { handleWarmup, warmupResponse } from '../../lib/warmup.js';

export async function handler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
  // Handle warmup events - exit early to avoid unnecessary processing
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  try {
    // Get auth context
    const authContext = await getAuthContext(event);

    // Require admin role
    const authError = requireAdmin(authContext);
    if (authError) return authError;

    // Get familyId and invitationId from path
    const familyId = event.pathParameters?.['familyId'];
    const invitationId = event.pathParameters?.['invitationId'];

    if (!familyId) {
      return errorResponse(400, 'BadRequest', 'Missing familyId in path');
    }

    if (!invitationId) {
      return errorResponse(400, 'BadRequest', 'Missing invitationId in path');
    }

    // Verify family access
    const accessError = verifyFamilyAccess(authContext!, familyId);
    if (accessError) return accessError;

    // Get inviter details
    const inviter = await getMember(familyId, authContext!.memberId);
    if (!inviter) {
      return errorResponse(404, 'NotFound', 'Inviter member not found');
    }

    // Get family details
    const family = await FamilyModel.getById(familyId);
    if (!family) {
      return errorResponse(404, 'NotFound', 'Family not found');
    }

    // Resend invitation
    try {
      const invitation = await resendInvitation(
        familyId,
        invitationId,
        inviter.name,
        family.name
      );

      logger.info('Invitation resent successfully', {
        invitationId: invitation.invitationId,
        email: invitation.email,
        familyId,
      });

      // Remove sensitive fields from response
      const { token, tokenSignature, ...safeInvitation } = invitation;

      return successResponse(200, {
        ...safeInvitation,
        invitedByName: inviter.name,
      });
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (errorMessage === 'INVITATION_NOT_FOUND') {
        return errorResponse(404, 'NotFound', 'Invitation not found');
      }

      if (errorMessage === 'INVITATION_NOT_PENDING') {
        return errorResponse(400, 'BadRequest', 'Only pending invitations can be resent');
      }

      if (errorMessage === 'INVITATION_NOT_EXPIRED') {
        return errorResponse(400, 'BadRequest', 'Only expired invitations can be resent');
      }

      throw error;
    }
  } catch (error) {
    logger.error('Failed to resend invitation', error as Error, {
      path: event.path,
      familyId: event.pathParameters?.['familyId'],
      invitationId: event.pathParameters?.['invitationId'],
    });
    return errorResponse(500, 'InternalServerError', 'Failed to resend invitation');
  }
}
