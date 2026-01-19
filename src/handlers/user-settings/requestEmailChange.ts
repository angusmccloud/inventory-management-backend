/**
 * POST /user-settings/email-change
 *
 * Request an email change by verifying the current password and issuing a ticket.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { z } from 'zod';
import {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { handleWarmup, warmupResponse } from '../../lib/warmup.js';
import { successResponse, errorResponse } from '../../lib/response.js';
import { getUserContext } from '../../lib/auth.js';
import { createLambdaLogger } from '../../lib/logger.js';
import { enforceRateLimit } from '../../lib/rate-limiter.js';
import { MemberModel } from '../../models/member.js';
import { CredentialVerificationTicketModel } from '../../models/credentialVerificationTicket.js';
import { NotificationService } from '../../services/notificationService.js';
import { recordAuditEvent } from '../../services/auditLogService.js';
import { generateUUID } from '../../lib/uuid.js';

const COGNITO_USER_POOL_ID = process.env['COGNITO_USER_POOL_ID'] || '';
const COGNITO_USER_POOL_CLIENT_ID = process.env['COGNITO_USER_POOL_CLIENT_ID'] || '';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env['AWS_REGION'] || 'us-east-1',
});

const RequestEmailChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newEmail: z.string().email(),
});

type RequestEmailChangeInput = z.infer<typeof RequestEmailChangeSchema>;

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
      // fallback to console
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

    const parsed = RequestEmailChangeSchema.safeParse(JSON.parse(event.body));
    if (!parsed.success) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid request body', parsed.error.errors);
    }

    if (!COGNITO_USER_POOL_ID || !COGNITO_USER_POOL_CLIENT_ID) {
      return errorResponse(500, 'CONFIG_ERROR', 'Cognito configuration missing');
    }

    const { currentPassword, newEmail }: RequestEmailChangeInput = parsed.data;
    const userContext = getUserContext(event, logger);

    const member = await MemberModel.getByMemberId(userContext.memberId);
    if (!member || member.status !== 'active') {
      return errorResponse(403, 'FORBIDDEN', 'Forbidden');
    }

    const rateLimit = await enforceRateLimit({
      memberId: member.memberId,
      action: 'email_change',
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

    if (member.email === newEmail) {
      return errorResponse(400, 'BAD_REQUEST', 'New email must be different');
    }

    const isVerified = await verifyCurrentPassword(member.email, currentPassword, logger);
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
        actionType: 'email_change',
        expiresAt,
        ttl,
        newEmail,
      },
      ticketId
    );

    await NotificationService.createUserSettingsReceipt({
      familyId: member.familyId,
      memberId: member.memberId,
      type: 'EMAIL_CHANGE_NOTICE',
      payload: {
        newEmailDomain: newEmail.split('@')[1] || '',
      },
    });

    await recordAuditEvent({
      familyId: member.familyId,
      memberId: member.memberId,
      action: 'EMAIL_CHANGE_REQUESTED',
      correlationId: context.awsRequestId,
    });

    logger.info('Email change requested', {
      memberId: member.memberId,
      familyId: member.familyId,
    });

    return successResponse(202, {
      ticketId: ticket.ticketId,
      expiresAt: ticket.expiresAt,
    });
  } catch (error) {
    logger.error('Failed to request email change', error as Error, {
      path: event.path,
    });
    return errorResponse(500, 'INTERNAL_ERROR', 'Failed to request email change');
  }
};
