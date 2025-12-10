/**
 * Get Invitation Handler
 * GET /families/{familyId}/invitations/{invitationId}
 * Feature: 003-member-management
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { logger } from '../../lib/logger';
import { successResponse, errorResponse } from '../../lib/response';
import { getAuthContext, requireAdmin, verifyFamilyAccess } from '../../lib/authorization';
import { getInvitation } from '../../services/invitationService';
import { getMember } from '../../services/memberService';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Get auth context
    const authContext = getAuthContext(event);

    // Require admin role
    const authError = requireAdmin(authContext);
    if (authError) return authError;

    // Get familyId and invitationId from path
    const familyId = event.pathParameters?.['familyId'];
    const invitationId = event.pathParameters?.['invitationId'];

    if (!familyId || !invitationId) {
      return errorResponse(400, 'BadRequest', 'Missing familyId or invitationId in path');
    }

    // Verify family access
    const accessError = verifyFamilyAccess(authContext!, familyId);
    if (accessError) return accessError;

    // Get invitation
    const invitation = await getInvitation(familyId, invitationId);

    if (!invitation) {
      return errorResponse(404, 'NotFound', 'Invitation not found');
    }

    // Get inviter details
    const inviter = await getMember(familyId, invitation.invitedBy);

    // Remove sensitive fields
    const { token, tokenSignature, ...safeInvitation } = invitation;

    logger.info('Invitation retrieved', {
      invitationId,
      familyId,
    });

    return successResponse(200, {
      ...safeInvitation,
      invitedByName: inviter?.name || 'Unknown',
    });
  } catch (error) {
    logger.error('Failed to get invitation', error as Error, {
      path: event.path,
      familyId: event.pathParameters?.['familyId'],
      invitationId: event.pathParameters?.['invitationId'],
    });
    return errorResponse(500, 'InternalServerError', 'Failed to get invitation');
  }
}

