/**
 * Revoke Invitation Handler
 * DELETE /families/{familyId}/invitations/{invitationId}
 * Feature: 003-member-management
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Context } from 'aws-lambda';
import { logger } from '../../lib/logger';
import { successResponse, errorResponse } from '../../lib/response';
import { getAuthContext, requireAdmin, verifyFamilyAccess } from '../../lib/authorization';
import { revokeInvitation } from '../../services/invitationService';
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

    if (!familyId || !invitationId) {
      return errorResponse(400, 'BadRequest', 'Missing familyId or invitationId in path');
    }

    // Verify family access
    const accessError = verifyFamilyAccess(authContext!, familyId);
    if (accessError) return accessError;

    // Revoke invitation
    try {
      await revokeInvitation(familyId, invitationId, authContext!.memberId);

      logger.info('Invitation revoked', {
        invitationId,
        familyId,
        revokedBy: authContext!.memberId,
      });

      return successResponse(204, null);
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (errorMessage === 'INVITATION_NOT_FOUND') {
        return errorResponse(404, 'NotFound', 'Invitation not found');
      }

      if (errorMessage === 'INVITATION_NOT_PENDING') {
        return errorResponse(400, 'BadRequest', 'Only pending invitations can be revoked');
      }

      throw error;
    }
  } catch (error) {
    logger.error('Failed to revoke invitation', error as Error, {
      path: event.path,
      familyId: event.pathParameters?.['familyId'],
      invitationId: event.pathParameters?.['invitationId'],
    });
    return errorResponse(500, 'InternalServerError', 'Failed to revoke invitation');
  }
}

