/**
 * Authorization middleware for role-based access control
 * Feature: 003-member-management
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { logger } from './logger';
import { errorResponse } from './response';
import { getMember } from '../services/memberService';

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
export async function getAuthContext(event: APIGatewayProxyEvent): Promise<AuthContext | null> {
  try {
    const authorizer = event.requestContext.authorizer;
    const claims = (authorizer?.['claims'] as Record<string, unknown>) || {};

    const memberId =
      (claims['sub'] as string | undefined) ||
      (claims['cognito:username'] as string | undefined) ||
      (authorizer?.['memberId'] as string | undefined);
    const email =
      (claims['email'] as string | undefined) ||
      (authorizer?.['email'] as string | undefined);

    if (!memberId || !email) {
      logger.warn('Missing basic auth claims', { hasAuthorizer: !!authorizer });
      return null;
    }

    let familyId =
      (authorizer?.['familyId'] as string | undefined) ||
      (claims['custom:familyId'] as string | undefined) ||
      '';
    let role =
      (authorizer?.['role'] as AuthContext['role'] | undefined) ||
      (claims['custom:role'] as AuthContext['role'] | undefined) ||
      null;

    const pathFamilyId = event.pathParameters?.['familyId'];

    // When Cognito authorizer does not inject family/role context, resolve from DynamoDB using path familyId
    if ((!familyId || !role) && pathFamilyId) {
      try {
        const member = await getMember(pathFamilyId, memberId);

        if (!member) {
          logger.warn('Member not found for family during auth resolution', {
            memberId,
            pathFamilyId,
          });
          return null;
        }

        familyId = member.familyId;
        role = member.role;
      } catch (lookupError) {
        logger.error(
          'Failed to resolve member from family during auth context build',
          lookupError as Error,
          {
            memberId,
            pathFamilyId,
          }
        );
        return null;
      }
    }

    if (!familyId || !role) {
      logger.warn('Incomplete auth context after resolution', {
        memberId,
        hasFamilyId: !!familyId,
        hasRole: !!role,
      });
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

