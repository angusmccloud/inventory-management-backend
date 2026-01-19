/**
 * POST /user-settings/email-change/confirm
 *
 * Confirm an email change using the verification ticket.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { z } from 'zod';
import {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { handleWarmup, warmupResponse } from '../../lib/warmup.js';
import { successResponse, errorResponse } from '../../lib/response.js';
import { createLambdaLogger } from '../../lib/logger.js';
import { CredentialVerificationTicketModel } from '../../models/credentialVerificationTicket.js';
import { MemberModel } from '../../models/member.js';
import { docClient, getTableName } from '../../lib/dynamodb.js';
import { KeyBuilder } from '../../types/entities.js';
import { recordAuditEvent } from '../../services/auditLogService.js';

const TABLE_NAME = getTableName();
const COGNITO_USER_POOL_ID = process.env['COGNITO_USER_POOL_ID'] || '';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env['AWS_REGION'] || 'us-east-1',
});

const ConfirmEmailChangeSchema = z.object({
  ticketId: z.string().min(1),
});

type ConfirmEmailChangeInput = z.infer<typeof ConfirmEmailChangeSchema>;

const getFamilyIdFromTicket = (ticketId: string): string | null => {
  const parts = ticketId.split('_');
  if (parts.length < 2) {
    return null;
  }
  return parts[0] || null;
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

    const parsed = ConfirmEmailChangeSchema.safeParse(JSON.parse(event.body));
    if (!parsed.success) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid request body', parsed.error.errors);
    }

    if (!COGNITO_USER_POOL_ID) {
      return errorResponse(500, 'CONFIG_ERROR', 'Cognito configuration missing');
    }

    const { ticketId }: ConfirmEmailChangeInput = parsed.data;
    const familyId = getFamilyIdFromTicket(ticketId);
    if (!familyId) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid ticket');
    }

    const ticket = await CredentialVerificationTicketModel.getById(familyId, ticketId);
    if (!ticket || ticket.actionType !== 'email_change') {
      return errorResponse(404, 'NOT_FOUND', 'Ticket not found');
    }

    if (ticket.status !== 'pending') {
      return errorResponse(400, 'BAD_REQUEST', 'Ticket already processed');
    }

    if (new Date(ticket.expiresAt).getTime() <= Date.now()) {
      return errorResponse(410, 'EXPIRED', 'Ticket expired');
    }

    if (!ticket.newEmail) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid ticket');
    }

    const member = await MemberModel.getById(familyId, ticket.memberId);
    if (!member || member.status !== 'active') {
      return errorResponse(403, 'FORBIDDEN', 'Forbidden');
    }

    await cognitoClient.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: COGNITO_USER_POOL_ID,
        Username: member.email,
        UserAttributes: [
          { Name: 'email', Value: ticket.newEmail },
          { Name: 'email_verified', Value: 'true' },
        ],
      })
    );

    const now = new Date().toISOString();
    const keys = KeyBuilder.member(familyId, member.memberId);
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: keys.PK, SK: keys.SK },
        UpdateExpression: 'SET email = :email, updatedAt = :now',
        ExpressionAttributeValues: {
          ':email': ticket.newEmail,
          ':now': now,
        },
        ConditionExpression: 'attribute_exists(PK)',
      })
    );

    await CredentialVerificationTicketModel.updateStatus(familyId, ticketId, 'confirmed');

    await recordAuditEvent({
      familyId,
      memberId: member.memberId,
      action: 'EMAIL_CHANGE_CONFIRMED',
      correlationId: context.awsRequestId,
    });

    logger.info('Email change confirmed', {
      memberId: member.memberId,
      familyId,
    });

    return successResponse({
      memberId: member.memberId,
      displayName: member.name,
      primaryEmail: ticket.newEmail,
      passwordUpdatedAt: member.passwordUpdatedAt || now,
      pendingDeletion: false,
    });
  } catch (error) {
    logger.error('Failed to confirm email change', error as Error, {
      path: event.path,
    });
    return errorResponse(500, 'INTERNAL_ERROR', 'Failed to confirm email change');
  }
};
