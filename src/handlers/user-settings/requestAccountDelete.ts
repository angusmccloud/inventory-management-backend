/**
 * POST /user-settings/deletion
 *
 * Request account deletion by verifying the current password and issuing a ticket.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { z } from 'zod';
import {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { handleWarmup, warmupResponse } from '../../lib/warmup.js';
import { successResponse, errorResponse } from '../../lib/response.js';
import { getUserContext } from '../../lib/auth.js';
import { createLambdaLogger } from '../../lib/logger.js';
import { docClient, getTableName } from '../../lib/dynamodb.js';
import { enforceRateLimit } from '../../lib/rate-limiter.js';
import { MemberModel } from '../../models/member.js';
import { CredentialVerificationTicketModel } from '../../models/credentialVerificationTicket.js';
import { NotificationService } from '../../services/notificationService.js';
import { recordAuditEvent } from '../../services/auditLogService.js';
import { generateUUID } from '../../lib/uuid.js';
import { KeyBuilder } from '../../types/entities.js';

const TABLE_NAME = getTableName();
const COGNITO_USER_POOL_ID = process.env['COGNITO_USER_POOL_ID'] || '';
const COGNITO_USER_POOL_CLIENT_ID = process.env['COGNITO_USER_POOL_CLIENT_ID'] || '';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env['AWS_REGION'] || 'us-east-1',
});

const RequestDeletionSchema = z.object({
  currentPassword: z.string().min(1),
  acknowledgementText: z.string().optional(),
});

type RequestDeletionInput = z.infer<typeof RequestDeletionSchema>;

const verifyCurrentPassword = async (username: string, password: string): Promise<boolean> => {
  try {
    await cognitoClient.send(
      new AdminInitiateAuthCommand({
        UserPoolId: COGNITO_USER_POOL_ID,
        ClientId: COGNITO_USER_POOL_CLIENT_ID,
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password,
        },
      })
    );
    return true;
  } catch {
    return false;
  }
};

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

    const parsed = RequestDeletionSchema.safeParse(JSON.parse(event.body));
    if (!parsed.success) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid request body', parsed.error.errors);
    }

    if (!COGNITO_USER_POOL_ID || !COGNITO_USER_POOL_CLIENT_ID) {
      return errorResponse(500, 'CONFIG_ERROR', 'Cognito configuration missing');
    }

    const { currentPassword, acknowledgementText }: RequestDeletionInput = parsed.data;
    if (acknowledgementText && acknowledgementText !== 'DELETE') {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid acknowledgement text');
    }

    const userContext = getUserContext(event, logger);
    const member = await MemberModel.getByMemberId(userContext.memberId);
    if (!member || member.status !== 'active') {
      return errorResponse(403, 'FORBIDDEN', 'Forbidden');
    }

    const rateLimit = await enforceRateLimit({
      memberId: member.memberId,
      action: 'account_deletion',
      logger,
    });
    if (!rateLimit.allowed) {
      return errorResponse(
        429,
        'RATE_LIMITED',
        'Too many requests. Try again later.',
        undefined,
        { resetAt: rateLimit.resetAt }
      );
    }

    const isVerified = await verifyCurrentPassword(member.email, currentPassword);
    if (!isVerified) {
      return errorResponse(401, 'UNAUTHORIZED', 'Invalid credentials');
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const ttl = Math.floor(Date.parse(expiresAt) / 1000);
    const ticketId = `${member.familyId}_${generateUUID()}`;

    const ticket = await CredentialVerificationTicketModel.create(
      {
        familyId: member.familyId,
        memberId: member.memberId,
        actionType: 'delete_account',
        expiresAt,
        ttl,
      },
      ticketId
    );

    const now = new Date().toISOString();
    const keys = KeyBuilder.member(member.familyId, member.memberId);
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: keys.PK, SK: keys.SK },
        UpdateExpression: 'SET deletionRequestedAt = :now, updatedAt = :now',
        ExpressionAttributeValues: {
          ':now': now,
        },
        ConditionExpression: 'attribute_exists(PK)',
      })
    );

    await NotificationService.createUserSettingsReceipt({
      familyId: member.familyId,
      memberId: member.memberId,
      type: 'DELETION_RECEIPT',
      payload: {
        stage: 'requested',
      },
    });

    await recordAuditEvent({
      familyId: member.familyId,
      memberId: member.memberId,
      action: 'ACCOUNT_DELETION_REQUESTED',
      correlationId: context.awsRequestId,
    });

    logger.info('Account deletion requested', {
      memberId: member.memberId,
      familyId: member.familyId,
    });

    return successResponse(202, {
      ticketId: ticket.ticketId,
      expiresAt: ticket.expiresAt,
    });
  } catch (error) {
    logger.error('Failed to request account deletion', error as Error, {
      path: event.path,
    });
    return errorResponse(500, 'INTERNAL_ERROR', 'Failed to request account deletion');
  }
};
