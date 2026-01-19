/**
 * List Invitations Handler
 * GET /families/{familyId}/invitations
 * Feature: 003-member-management
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Context } from 'aws-lambda';
import { logger } from '../../lib/logger';
import { successResponse, errorResponse } from '../../lib/response';
import { getAuthContext, requireAdmin, verifyFamilyAccess } from '../../lib/authorization';
import { listInvitations } from '../../services/invitationService';
import { MemberModel } from '../../models/member';
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

    // Get familyId from path
    const familyId = event.pathParameters?.['familyId'];
    if (!familyId) {
      return errorResponse(400, 'BadRequest', 'Missing familyId in path');
    }

    // Verify family access
    const accessError = verifyFamilyAccess(authContext!, familyId);
    if (accessError) return accessError;

    // Get status filter from query params
    const status = (event.queryStringParameters?.['status'] || 'pending') as
      | 'pending'
      | 'accepted'
      | 'expired'
      | 'revoked'
      | 'declined'
      | 'all';

    // List invitations
    const invitations = await listInvitations(familyId, status);

    // Enrich with inviter names
    const members = await MemberModel.listByFamily(familyId);
    const enrichedInvitations = invitations.map((invitation) => {
      const inviter = members.find((m) => m.memberId === invitation.invitedBy);
      const { token, tokenSignature, ...safeInvitation } = invitation;
      
      return {
        ...safeInvitation,
        invitedByName: inviter?.name || 'Unknown',
      };
    });

    logger.info('Invitations listed', {
      familyId,
      status,
      count: enrichedInvitations.length,
    });

    return successResponse(200, {
      invitations: enrichedInvitations,
    });
  } catch (error) {
    logger.error('Failed to list invitations', error as Error, {
      path: event.path,
      familyId: event.pathParameters?.['familyId'],
    });
    return errorResponse(500, 'InternalServerError', 'Failed to list invitations');
  }
}
