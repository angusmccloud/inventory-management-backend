/**
 * PATCH /user-settings/profile
 *
 * Update the authenticated member's profile details.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { z } from 'zod';
import { handleWarmup, warmupResponse } from '../../lib/warmup.js';
import { successResponse, errorResponse } from '../../lib/response.js';
import { getUserContext } from '../../lib/auth.js';
import { createLambdaLogger } from '../../lib/logger.js';
import { MemberModel } from '../../models/member.js';
import { recordAuditEvent } from '../../services/auditLogService.js';

const UpdateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .refine((value) => !/[\x00-\x1F\x7F]/.test(value), {
      message: 'Display name contains invalid characters',
    }),
});

type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  const logger = createLambdaLogger(context.awsRequestId);

  try {
    if (!event.body) {
      return errorResponse(400, 'BAD_REQUEST', 'Request body is required');
    }

    const parsed = UpdateProfileSchema.safeParse(JSON.parse(event.body));
    if (!parsed.success) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid request body', parsed.error.errors);
    }

    const { displayName }: UpdateProfileInput = parsed.data;
    const userContext = getUserContext(event, logger);
    const member = userContext.familyId
      ? await MemberModel.getById(userContext.familyId, userContext.memberId)
      : await MemberModel.getByMemberId(userContext.memberId);

    if (!member || member.status !== 'active' || member.isActive === false) {
      return errorResponse(403, 'FORBIDDEN', 'Forbidden');
    }

    const updatedMember = await MemberModel.update(member.familyId, member.memberId, {
      name: displayName,
    });

    await recordAuditEvent({
      familyId: member.familyId,
      memberId: member.memberId,
      action: 'PROFILE_UPDATED',
      correlationId: context.awsRequestId,
      details: {
        displayName,
      },
    });

    return successResponse({
      memberId: updatedMember.memberId,
      displayName: updatedMember.name,
      primaryEmail: updatedMember.email,
      passwordUpdatedAt: updatedMember.passwordUpdatedAt || updatedMember.updatedAt,
      pendingEmail: null,
      pendingDeletion: Boolean(updatedMember.deletionRequestedAt),
      lastAuditEvent: updatedMember.updatedAt,
    });
  } catch (error) {
    logger.error('Failed to update user profile', error as Error, {
      path: event.path,
    });
    return errorResponse(500, 'INTERNAL_ERROR', 'Failed to update profile');
  }
};
