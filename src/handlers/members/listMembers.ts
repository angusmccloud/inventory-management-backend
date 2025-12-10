/**
 * List Members Handler
 * GET /families/{familyId}/members
 * Feature: 003-member-management
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { logger } from '../../lib/logger';
import { successResponse, errorResponse } from '../../lib/response';
import { getAuthContext, requireFamilyMember, verifyFamilyAccess } from '../../lib/authorization';
import { listMembers } from '../../services/memberService';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Get auth context
    const authContext = getAuthContext(event);

    // Require family membership (any role can list members)
    const authError = requireFamilyMember(authContext);
    if (authError) return authError;

    // Get familyId from path
    const familyId = event.pathParameters?.['familyId'];
    if (!familyId) {
      return errorResponse(400, 'BadRequest', 'Missing familyId in path');
    }

    // Verify family access
    const accessError = verifyFamilyAccess(authContext!, familyId);
    if (accessError) return accessError;

    // Get query parameters
    const includeRemoved =
      authContext!.role === 'admin' &&
      (event.queryStringParameters?.['includeRemoved'] === 'true' ||
        event.queryStringParameters?.['status'] === 'all');

    // List members
    const members = await listMembers(familyId, includeRemoved);

    // Calculate summary statistics
    const activeMembers = members.filter((m) => m.status === 'active');
    const adminCount = activeMembers.filter((m) => m.role === 'admin').length;
    const suggesterCount = activeMembers.filter((m) => m.role === 'suggester').length;

    logger.info('Members listed', {
      familyId,
      includeRemoved,
      totalCount: members.length,
      activeCount: activeMembers.length,
    });

    return successResponse(200, {
      members,
      summary: {
        total: members.length,
        admins: adminCount,
        suggesters: suggesterCount,
      },
    });
  } catch (error) {
    logger.error('Failed to list members', error as Error, {
      path: event.path,
      familyId: event.pathParameters?.['familyId'],
    });
    return errorResponse(500, 'InternalServerError', 'Failed to list members');
  }
}

