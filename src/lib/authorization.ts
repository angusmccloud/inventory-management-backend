/**
 * Authorization middleware for role-based access control
 * Feature: 003-member-management
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { logger } from './logger';
import { errorResponse } from './response';

/**
 * Extract member details from Lambda authorizer context
 */
export interface AuthContext {
  memberId: string;
  familyId: string;
  role: 'admin' | 'suggester';
  email: string;
}

/**
 * Get auth context from API Gateway event
 */
export function getAuthContext(event: APIGatewayProxyEvent): AuthContext | null {
  try {
    const authorizer = event.requestContext.authorizer;
    
    if (!authorizer) {
      return null;
    }

    // Extract from Lambda authorizer claims
    const memberId = authorizer['claims']?.sub || authorizer['memberId'];
    const familyId = authorizer['familyId'];
    const role = authorizer['role'];
    const email = authorizer['claims']?.email || authorizer['email'];

    if (!memberId || !familyId || !role || !email) {
      logger.warn('Incomplete auth context', { authorizer });
      return null;
    }

    return { memberId, familyId, role, email };
  } catch (error) {
    logger.error('Failed to parse auth context', error as Error);
    return null;
  }
}

/**
 * Require admin role for the operation
 * Returns error response if not admin, otherwise returns null (proceed)
 */
export function requireAdmin(authContext: AuthContext | null): APIGatewayProxyResult | null {
  if (!authContext) {
    return errorResponse(401, 'Unauthorized', 'Missing or invalid authentication');
  }

  if (authContext.role !== 'admin') {
    logger.warn('Admin role required', {
      memberId: authContext.memberId,
      role: authContext.role,
    });
    return errorResponse(403, 'Forbidden', 'Admin role required for this operation');
  }

  return null; // Authorization passed
}

/**
 * Require family membership (admin or suggester)
 * Returns error response if not a member, otherwise returns null (proceed)
 */
export function requireFamilyMember(authContext: AuthContext | null): APIGatewayProxyResult | null {
  if (!authContext) {
    return errorResponse(401, 'Unauthorized', 'Missing or invalid authentication');
  }

  // Both admin and suggester have access
  return null; // Authorization passed
}

/**
 * Verify the user belongs to the family in the path parameter
 */
export function verifyFamilyAccess(
  authContext: AuthContext | null,
  pathFamilyId: string
): APIGatewayProxyResult | null {
  if (!authContext) {
    return errorResponse(401, 'Unauthorized', 'Missing or invalid authentication');
  }

  if (authContext.familyId !== pathFamilyId) {
    logger.warn('Family ID mismatch', {
      authFamilyId: authContext.familyId,
      pathFamilyId,
      memberId: authContext.memberId,
    });
    return errorResponse(403, 'Forbidden', 'Access denied to this family');
  }

  return null; // Authorization passed
}

