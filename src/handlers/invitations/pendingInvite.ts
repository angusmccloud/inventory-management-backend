/**
 * GET /pending-invitations
 * Feature: 016-pending-invite-join
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { z } from 'zod';
import { handleWarmup, warmupResponse } from '../../lib/warmup.js';
import { successResponse, errorResponse } from '../../lib/response.js';
import { getUserContext } from '../../lib/auth.js';
import { createLambdaLogger } from '../../lib/logger.js';
import { getPendingInvitationList } from '../../services/inviteMatching/pendingInviteService';
import {
  publishLookupMetric,
  logPendingInviteEvent,
} from '../../lib/monitoring/pendingInviteMetrics';

const identitySchema = z.object({
  email: z.string().email(),
});

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  const logger = createLambdaLogger(context.awsRequestId);

  try {
    const startTime = Date.now();
    const userContext = getUserContext(event, logger);
    const validation = identitySchema.safeParse({ email: userContext.email });

    if (!validation.success) {
      return errorResponse(400, 'INVALID_IDENTITY', 'Invalid identity data');
    }

    const pendingInvites = await getPendingInvitationList(userContext.memberId, {
      email: userContext.email,
      phone: undefined,
    });

    const durationMs = Date.now() - startTime;
    logPendingInviteEvent(context.awsRequestId, 'lookup', {
      memberId: userContext.memberId,
      inviteCount: pendingInvites.invites.length,
      durationMs,
    });
    void publishLookupMetric(durationMs);

    return successResponse(pendingInvites);
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error('Failed to fetch pending invitations', err, {
      message: err.message,
    });
    return errorResponse(500, 'INTERNAL_ERROR', 'Failed to load pending invitations');
  }
};
