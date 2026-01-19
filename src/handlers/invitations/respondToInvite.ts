/**
 * POST /pending-invitations/{inviteId}/accept|decline
 * POST /pending-invitations/decline-all
 * Feature: 016-pending-invite-join
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { handleWarmup, warmupResponse } from '../../lib/warmup.js';
import { successResponse, errorResponse } from '../../lib/response.js';
import { getUserContext } from '../../lib/auth.js';
import { createLambdaLogger } from '../../lib/logger.js';
import { docClient, getTableName } from '../../lib/dynamodb';
import { KeyBuilder } from '../../types/entities';
import { MemberModel } from '../../models/member';
import { verifyDecisionToken } from '../../services/inviteMatching/decisionToken';
import { getPendingInvitationList } from '../../services/inviteMatching/pendingInviteService';
import { buildDecisionLogItem } from '../../services/inviteMatching/decisionLogger';
import {
  publishDecisionMetric,
  logPendingInviteEvent,
} from '../../lib/monitoring/pendingInviteMetrics';

const TABLE_NAME = getTableName();

const acceptSchema = z.object({
  decisionToken: z.string().min(1),
  switchConfirmed: z.boolean().optional(),
  trackAnalytics: z.boolean().optional(),
});

const declineSchema = z.object({
  decisionToken: z.string().min(1),
  reason: z.string().max(280).optional(),
});

const declineAllSchema = z.object({
  decisionToken: z.string().min(1),
  reason: z.string().max(280).optional(),
});

const isAcceptPath = (path: string): boolean => path.endsWith('/accept');
const isDeclinePath = (path: string): boolean => path.endsWith('/decline');
const isDeclineAllPath = (path: string): boolean => path.endsWith('/decline-all');

const buildDeclineTtl = (): number => {
  const graceSeconds = parseInt(
    process.env['INVITATION_TTL_GRACE_SECONDS'] || '604800',
    10
  );
  return Math.floor(Date.now() / 1000) + graceSeconds;
};

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  const logger = createLambdaLogger(context.awsRequestId);
  const path = event.path || '';

  try {
    const startTime = Date.now();
    const userContext = getUserContext(event, logger);
    const body = JSON.parse(event.body || '{}');

    if (isAcceptPath(path)) {
      const validation = acceptSchema.safeParse(body);
      if (!validation.success) {
        return errorResponse(400, 'INVALID_REQUEST', 'Invalid request body', validation.error.errors);
      }

      if (!verifyDecisionToken(validation.data.decisionToken, userContext.memberId)) {
        return errorResponse(403, 'INVALID_TOKEN', 'Decision token is invalid or expired');
      }

      const pendingInvites = await getPendingInvitationList(userContext.memberId, {
        email: userContext.email,
        phone: undefined,
      });

      const inviteId = event.pathParameters?.['inviteId'];
      if (!inviteId) {
        return errorResponse(400, 'MISSING_INVITE_ID', 'Missing inviteId in path');
      }

      const invite = pendingInvites.invites.find((item) => item.inviteId === inviteId);
      if (!invite) {
        return errorResponse(404, 'INVITE_NOT_FOUND', 'Pending invite not found');
      }

      if (invite.requiresSwitchConfirmation && !validation.data.switchConfirmed) {
        return errorResponse(
          403,
          'SWITCH_CONFIRMATION_REQUIRED',
          'Switch confirmation is required to accept this invite'
        );
      }

      const existingMember = await MemberModel.getById(invite.familyId, userContext.memberId);
      if (existingMember) {
        return errorResponse(409, 'ALREADY_MEMBER', 'User is already a member of this family');
      }

      const now = new Date().toISOString();
      const memberKeys = KeyBuilder.member(invite.familyId, userContext.memberId);

      const memberItem = {
        ...memberKeys,
        memberId: userContext.memberId,
        familyId: invite.familyId,
        email: userContext.email,
        name: userContext.name,
        role: invite.roleOffered,
        status: 'active',
        version: 1,
        entityType: 'Member',
        createdAt: now,
        updatedAt: now,
      };

      const decisionItem = buildDecisionLogItem({
        inviteId,
        familyId: invite.familyId,
        actorUserId: userContext.memberId,
        actorMemberId: userContext.memberId,
        targetEmail: userContext.email,
        action: 'ACCEPTED',
        source: 'pending-detection',
        auditCorrelationId: context.awsRequestId,
      });

      await docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: TABLE_NAME,
                Key: {
                  PK: `FAMILY#${invite.familyId}`,
                  SK: `INVITATION#${inviteId}`,
                },
                UpdateExpression:
                  'SET #status = :status, #acceptedBy = :acceptedBy, #acceptedAt = :acceptedAt, #consumedAt = :consumedAt, #updatedAt = :updatedAt, #decisionSource = :decisionSource, #lastDecisionId = :lastDecisionId, #GSI2SK = :gsi2sk',
                ExpressionAttributeNames: {
                  '#status': 'status',
                  '#acceptedBy': 'acceptedBy',
                  '#acceptedAt': 'acceptedAt',
                  '#consumedAt': 'consumedAt',
                  '#updatedAt': 'updatedAt',
                  '#decisionSource': 'decisionSource',
                  '#lastDecisionId': 'lastDecisionId',
                  '#GSI2SK': 'GSI2SK',
                },
                ExpressionAttributeValues: {
                  ':status': 'accepted',
                  ':acceptedBy': userContext.memberId,
                  ':acceptedAt': now,
                  ':consumedAt': now,
                  ':updatedAt': now,
                  ':decisionSource': 'pending-detection',
                  ':lastDecisionId': decisionItem.decisionId,
                  ':gsi2sk': `STATUS#ACCEPTED#UPDATED#${now}#INVITE#${inviteId}`,
                  ':pendingStatus': 'pending',
                },
                ConditionExpression: 'attribute_exists(PK) AND #status = :pendingStatus',
              },
            },
            {
              Put: {
                TableName: TABLE_NAME,
                Item: memberItem,
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
            {
              Put: {
                TableName: TABLE_NAME,
                Item: decisionItem,
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          ],
        })
      );

      const durationMs = Date.now() - startTime;
      logPendingInviteEvent(context.awsRequestId, 'decision', {
        inviteId,
        familyId: invite.familyId,
        memberId: userContext.memberId,
        decisionId: decisionItem.decisionId,
        action: 'ACCEPTED',
        durationMs,
      });
      void publishDecisionMetric('ACCEPTED', durationMs);

      return successResponse({
        inviteId,
        familyId: invite.familyId,
        action: 'ACCEPTED',
        membershipId: userContext.memberId,
        auditId: decisionItem.decisionId,
        redirect: '/dashboard',
      });
    }

    if (isDeclinePath(path)) {
      const validation = declineSchema.safeParse(body);
      if (!validation.success) {
        return errorResponse(400, 'INVALID_REQUEST', 'Invalid request body', validation.error.errors);
      }

      if (!verifyDecisionToken(validation.data.decisionToken, userContext.memberId)) {
        return errorResponse(403, 'INVALID_TOKEN', 'Decision token is invalid or expired');
      }

      const inviteId = event.pathParameters?.['inviteId'];
      if (!inviteId) {
        return errorResponse(400, 'MISSING_INVITE_ID', 'Missing inviteId in path');
      }

      const pendingInvites = await getPendingInvitationList(userContext.memberId, {
        email: userContext.email,
        phone: undefined,
      });

      const invite = pendingInvites.invites.find((item) => item.inviteId === inviteId);
      if (!invite) {
        return errorResponse(404, 'INVITE_NOT_FOUND', 'Pending invite not found');
      }

      const now = new Date().toISOString();
      const decisionItem = buildDecisionLogItem({
        inviteId,
        familyId: invite.familyId,
        actorUserId: userContext.memberId,
        actorMemberId: userContext.memberId,
        targetEmail: userContext.email,
        action: 'DECLINED',
        source: 'pending-detection',
        message: validation.data.reason,
        auditCorrelationId: context.awsRequestId,
      });

      await docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: TABLE_NAME,
                Key: {
                  PK: `FAMILY#${invite.familyId}`,
                  SK: `INVITATION#${inviteId}`,
                },
                UpdateExpression:
                  'SET #status = :status, #declineReason = :declineReason, #consumedAt = :consumedAt, #updatedAt = :updatedAt, #decisionSource = :decisionSource, #lastDecisionId = :lastDecisionId, #GSI2SK = :gsi2sk, #ttl = :ttl',
                ExpressionAttributeNames: {
                  '#status': 'status',
                  '#declineReason': 'declineReason',
                  '#consumedAt': 'consumedAt',
                  '#updatedAt': 'updatedAt',
                  '#decisionSource': 'decisionSource',
                  '#lastDecisionId': 'lastDecisionId',
                  '#GSI2SK': 'GSI2SK',
                  '#ttl': 'ttl',
                },
                ExpressionAttributeValues: {
                  ':status': 'declined',
                  ':declineReason': validation.data.reason || null,
                  ':consumedAt': now,
                  ':updatedAt': now,
                  ':decisionSource': 'pending-detection',
                  ':lastDecisionId': decisionItem.decisionId,
                  ':gsi2sk': `STATUS#DECLINED#UPDATED#${now}#INVITE#${inviteId}`,
                  ':ttl': buildDeclineTtl(),
                  ':pendingStatus': 'pending',
                  ':expiredStatus': 'expired',
                },
                ConditionExpression: '#status IN (:pendingStatus, :expiredStatus)',
              },
            },
            {
              Put: {
                TableName: TABLE_NAME,
                Item: decisionItem,
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          ],
        })
      );

      const durationMs = Date.now() - startTime;
      logPendingInviteEvent(context.awsRequestId, 'decision', {
        inviteId,
        familyId: invite.familyId,
        memberId: userContext.memberId,
        decisionId: decisionItem.decisionId,
        reason: validation.data.reason,
        action: 'DECLINED',
        durationMs,
      });
      void publishDecisionMetric('DECLINED', durationMs);

      return successResponse({
        inviteId,
        familyId: invite.familyId,
        action: 'DECLINED',
        membershipId: null,
        auditId: decisionItem.decisionId,
        redirect: '/dashboard',
      });
    }

    if (isDeclineAllPath(path)) {
      const validation = declineAllSchema.safeParse(body);
      if (!validation.success) {
        return errorResponse(400, 'INVALID_REQUEST', 'Invalid request body', validation.error.errors);
      }

      if (!verifyDecisionToken(validation.data.decisionToken, userContext.memberId)) {
        return errorResponse(403, 'INVALID_TOKEN', 'Decision token is invalid or expired');
      }

      const pendingInvites = await getPendingInvitationList(userContext.memberId, {
        email: userContext.email,
        phone: undefined,
      });

      if (pendingInvites.invites.length === 0) {
        return successResponse({
          inviteId: 'none',
          familyId: '',
          action: 'DECLINED',
          membershipId: null,
          auditId: '',
          redirect: '/dashboard',
        });
      }

      let lastDecisionId = '';
      const now = new Date().toISOString();
      const ttl = buildDeclineTtl();

      for (const invite of pendingInvites.invites) {
        const decisionItem = buildDecisionLogItem({
          inviteId: invite.inviteId,
          familyId: invite.familyId,
          actorUserId: userContext.memberId,
          actorMemberId: userContext.memberId,
          targetEmail: userContext.email,
          action: 'DECLINED',
          source: 'pending-detection',
          message: validation.data.reason,
          auditCorrelationId: context.awsRequestId,
        });

        await docClient.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
                  TableName: TABLE_NAME,
                  Key: {
                    PK: `FAMILY#${invite.familyId}`,
                    SK: `INVITATION#${invite.inviteId}`,
                  },
                  UpdateExpression:
                    'SET #status = :status, #declineReason = :declineReason, #consumedAt = :consumedAt, #updatedAt = :updatedAt, #decisionSource = :decisionSource, #lastDecisionId = :lastDecisionId, #GSI2SK = :gsi2sk, #ttl = :ttl',
                  ExpressionAttributeNames: {
                    '#status': 'status',
                    '#declineReason': 'declineReason',
                    '#consumedAt': 'consumedAt',
                    '#updatedAt': 'updatedAt',
                    '#decisionSource': 'decisionSource',
                    '#lastDecisionId': 'lastDecisionId',
                    '#GSI2SK': 'GSI2SK',
                    '#ttl': 'ttl',
                  },
                  ExpressionAttributeValues: {
                    ':status': 'declined',
                    ':declineReason': validation.data.reason || null,
                    ':consumedAt': now,
                    ':updatedAt': now,
                    ':decisionSource': 'pending-detection',
                    ':lastDecisionId': decisionItem.decisionId,
                    ':gsi2sk': `STATUS#DECLINED#UPDATED#${now}#INVITE#${invite.inviteId}`,
                    ':ttl': ttl,
                    ':pendingStatus': 'pending',
                    ':expiredStatus': 'expired',
                  },
                  ConditionExpression: '#status IN (:pendingStatus, :expiredStatus)',
                },
              },
              {
                Put: {
                  TableName: TABLE_NAME,
                  Item: decisionItem,
                  ConditionExpression: 'attribute_not_exists(PK)',
                },
              },
            ],
          })
        );

        lastDecisionId = decisionItem.decisionId;
      }

      const durationMs = Date.now() - startTime;
      logPendingInviteEvent(context.awsRequestId, 'decision', {
        memberId: userContext.memberId,
        inviteCount: pendingInvites.invites.length,
        lastDecisionId,
        reason: validation.data.reason,
        action: 'DECLINED',
        durationMs,
      });
      void publishDecisionMetric('DECLINED', durationMs);

      return successResponse({
        inviteId: 'all',
        familyId: pendingInvites.invites[0]?.familyId || '',
        action: 'DECLINED',
        membershipId: null,
        auditId: lastDecisionId,
        redirect: '/family/create',
      });
    }

    return errorResponse(404, 'ROUTE_NOT_FOUND', 'Unsupported pending invite route');
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error('Failed to respond to pending invite', err, {
      message: err.message,
    });
    return errorResponse(500, 'INTERNAL_ERROR', 'Failed to respond to pending invite');
  }
};
