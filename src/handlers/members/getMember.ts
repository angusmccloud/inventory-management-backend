/**
 * Get Member Handler
 * GET /families/{familyId}/members/{memberId}
 * Feature: 003-member-management
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { logger } from '../../lib/logger';
import { successResponse, errorResponse } from '../../lib/response';
import { getAuthContext, requireFamilyMember, verifyFamilyAccess } from '../../lib/authorization';
import { getMember } from '../../services/memberService';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Get auth context
    const authContext = getAuthContext(event);

    // Require family membership (any role can view member details)
    const authError = requireFamilyMember(authContext);
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

    // Get member
    const member = await getMember(familyId, memberId);

    if (!member) {
      return errorResponse(404, 'NotFound', 'Member not found');
    }

    logger.info('Member retrieved', {
      familyId,
      memberId,
    });

    return successResponse(200, member);
  } catch (error) {
    logger.error('Failed to get member', error as Error, {
      path: event.path,
      familyId: event.pathParameters?.['familyId'],
      memberId: event.pathParameters?.['memberId'],
    });
    return errorResponse(500, 'InternalServerError', 'Failed to get member');
  }
}

