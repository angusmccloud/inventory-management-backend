/**
 * GET /user-settings/me
 *
 * Return the authenticated member's profile summary.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { handleWarmup, warmupResponse } from '../../lib/warmup.js';
import { successResponse, errorResponse } from '../../lib/response.js';
import { getUserContext } from '../../lib/auth.js';
import { createLambdaLogger } from '../../lib/logger.js';
import { MemberModel } from '../../models/member.js';

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  const logger = createLambdaLogger(context.awsRequestId);

  try {
    const userContext = getUserContext(event, logger);
    const member = userContext.familyId
      ? await MemberModel.getById(userContext.familyId, userContext.memberId)
      : await MemberModel.getByMemberId(userContext.memberId);

    if (!member || member.status !== 'active' || member.isActive === false) {
      return errorResponse(403, 'FORBIDDEN', 'Forbidden');
    }

    return successResponse({
      memberId: member.memberId,
      displayName: member.name,
      primaryEmail: member.email,
      passwordUpdatedAt: member.passwordUpdatedAt || member.updatedAt,
      pendingEmail: null,
      pendingDeletion: Boolean(member.deletionRequestedAt),
      lastAuditEvent: member.updatedAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return errorResponse(401, 'UNAUTHORIZED', 'Authentication required');
    }

    if (error instanceof Error && error.message === 'User must be member of a family') {
      return errorResponse(403, 'FORBIDDEN', 'Forbidden');
    }

    logger.error('Failed to load user profile', error as Error, {
      path: event.path,
    });
    return errorResponse(500, 'INTERNAL_ERROR', 'Failed to load profile');
  }
};
