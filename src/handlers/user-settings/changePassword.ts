/**
 * POST /user-settings/password-change
 *
 * Change the authenticated user's password after verifying current credentials.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { z } from 'zod';
import {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  AdminUserGlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { handleWarmup, warmupResponse } from '../../lib/warmup.js';
import { successResponse, errorResponse } from '../../lib/response.js';
import { getUserContext } from '../../lib/auth.js';
import { createLambdaLogger } from '../../lib/logger.js';
import { docClient, getTableName } from '../../lib/dynamodb.js';
import { enforceRateLimit } from '../../lib/rate-limiter.js';
import { MemberModel } from '../../models/member.js';
import { KeyBuilder } from '../../types/entities.js';
import { recordAuditEvent } from '../../services/auditLogService.js';

const TABLE_NAME = getTableName();
const COGNITO_USER_POOL_ID = process.env['COGNITO_USER_POOL_ID'] || '';
const COGNITO_USER_POOL_CLIENT_ID = process.env['COGNITO_USER_POOL_CLIENT_ID'] || '';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env['AWS_REGION'] || 'us-east-1',
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(12)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/),
});

type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

const verifyCurrentPassword = async (
  username: string,
  password: string,
  logger?: ReturnType<typeof createLambdaLogger>
): Promise<boolean> => {
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
  } catch (err) {
    // Log error to aid debugging (do not expose details to callers)
    if (logger && typeof logger.error === 'function') {
      logger.error('Cognito AdminInitiateAuth failed', err as Error, { username });
    } else {
      // eslint-disable-next-line no-console
      console.error('Cognito AdminInitiateAuth failed', err);
    }
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

    const parsed = ChangePasswordSchema.safeParse(JSON.parse(event.body));
    if (!parsed.success) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid request body', parsed.error.errors);
    }

    if (!COGNITO_USER_POOL_ID || !COGNITO_USER_POOL_CLIENT_ID) {
      return errorResponse(500, 'CONFIG_ERROR', 'Cognito configuration missing');
    }

    const { currentPassword, newPassword }: ChangePasswordInput = parsed.data;
    const userContext = getUserContext(event, logger);

    const member = await MemberModel.getByMemberId(userContext.memberId);
    if (!member || member.status !== 'active') {
      return errorResponse(403, 'FORBIDDEN', 'Forbidden');
    }

    const rateLimit = await enforceRateLimit({
      memberId: member.memberId,
      action: 'password_change',
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

    const isVerified = await verifyCurrentPassword(member.email, currentPassword, logger);
    if (!isVerified) {
      return errorResponse(401, 'UNAUTHORIZED', 'Invalid credentials');
    }

    await cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: COGNITO_USER_POOL_ID,
        Username: member.email,
        Password: newPassword,
        Permanent: true,
      })
    );

    await cognitoClient.send(
      new AdminUserGlobalSignOutCommand({
        UserPoolId: COGNITO_USER_POOL_ID,
        Username: member.email,
      })
    );

    const now = new Date().toISOString();
    const keys = KeyBuilder.member(member.familyId, member.memberId);

    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: keys.PK, SK: keys.SK },
        UpdateExpression: 'SET passwordUpdatedAt = :now, updatedAt = :now',
        ExpressionAttributeValues: {
          ':now': now,
        },
        ConditionExpression: 'attribute_exists(PK)',
      })
    );

    await recordAuditEvent({
      familyId: member.familyId,
      memberId: member.memberId,
      action: 'PASSWORD_CHANGED',
      correlationId: context.awsRequestId,
    });

    logger.info('Password changed', {
      memberId: member.memberId,
      familyId: member.familyId,
    });

    return successResponse({
      passwordUpdatedAt: now,
      sessionsRevoked: true,
    });
  } catch (error) {
    logger.error('Failed to change password', error as Error, {
      path: event.path,
    });
    return errorResponse(500, 'INTERNAL_ERROR', 'Failed to change password');
  }
};
