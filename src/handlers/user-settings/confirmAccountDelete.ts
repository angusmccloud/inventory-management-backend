/**
 * POST /user-settings/deletion/confirm
 *
 * Confirm account deletion using the verification ticket.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { z } from 'zod';
import {
  CognitoIdentityProviderClient,
  AdminUserGlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { handleWarmup, warmupResponse } from '../../lib/warmup.js';
import { successResponse, errorResponse } from '../../lib/response.js';
import { createLambdaLogger } from '../../lib/logger.js';
import { CredentialVerificationTicketModel } from '../../models/credentialVerificationTicket.js';
import { MemberModel } from '../../models/member.js';
import { FamilyModel } from '../../models/family.js';
import { recordAuditEvent } from '../../services/auditLogService.js';
import { NotificationService } from '../../services/notificationService.js';

const COGNITO_USER_POOL_ID = process.env['COGNITO_USER_POOL_ID'] || '';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env['AWS_REGION'] || 'us-east-1',
});

const ConfirmDeletionSchema = z.object({
  ticketId: z.string().min(1),
});

type ConfirmDeletionInput = z.infer<typeof ConfirmDeletionSchema>;

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

    const parsed = ConfirmDeletionSchema.safeParse(JSON.parse(event.body));
    if (!parsed.success) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid request body', parsed.error.errors);
    }

    if (!COGNITO_USER_POOL_ID) {
      return errorResponse(500, 'CONFIG_ERROR', 'Cognito configuration missing');
    }

    const { ticketId }: ConfirmDeletionInput = parsed.data;
    const familyId = getFamilyIdFromTicket(ticketId);
    if (!familyId) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid ticket');
    }

    const ticket = await CredentialVerificationTicketModel.getById(familyId, ticketId);
    if (!ticket || ticket.actionType !== 'delete_account') {
      return errorResponse(404, 'NOT_FOUND', 'Ticket not found');
    }

    if (ticket.status !== 'pending') {
      return errorResponse(400, 'BAD_REQUEST', 'Ticket already processed');
    }

    if (new Date(ticket.expiresAt).getTime() <= Date.now()) {
      return errorResponse(410, 'EXPIRED', 'Ticket expired');
    }

    const member = await MemberModel.getById(familyId, ticket.memberId);
    if (!member || member.status !== 'active') {
      return errorResponse(403, 'FORBIDDEN', 'Forbidden');
    }

    const familyMembers = await MemberModel.listByFamily(familyId);
    const activeMembers = familyMembers.filter((m) => m.status === 'active');
    const isSoleMember = activeMembers.length === 1 && activeMembers[0]?.memberId === member.memberId;

    await MemberModel.delete(familyId, member.memberId);

    let familyDeleted = false;
    if (isSoleMember) {
      await FamilyModel.delete(familyId);
      familyDeleted = true;
    }

    await CredentialVerificationTicketModel.updateStatus(familyId, ticketId, 'confirmed');

    await cognitoClient.send(
      new AdminUserGlobalSignOutCommand({
        UserPoolId: COGNITO_USER_POOL_ID,
        Username: member.email,
      })
    );

    await NotificationService.createUserSettingsReceipt({
      familyId,
      memberId: member.memberId,
      type: 'DELETION_RECEIPT',
      payload: {
        stage: 'completed',
        familyDeleted,
      },
    });

    if (!familyDeleted) {
      const adminRecipients = activeMembers.filter(
        (m) => m.role === 'admin' && m.memberId !== member.memberId
      );

      await Promise.all(
        adminRecipients.map((admin) =>
          NotificationService.createUserSettingsReceipt({
            familyId,
            memberId: admin.memberId,
            type: 'DELETION_RECEIPT',
            payload: {
              stage: 'member_deleted',
              deletedMemberId: member.memberId,
            },
          })
        )
      );
    }

    await recordAuditEvent({
      familyId,
      memberId: member.memberId,
      action: 'ACCOUNT_DELETED',
      correlationId: context.awsRequestId,
    });

    logger.info('Account deletion confirmed', {
      memberId: member.memberId,
      familyId,
      familyDeleted,
    });

    return successResponse({
      memberDeleted: true,
      familyDeleted,
      deletionReceiptId: ticket.ticketId,
    });
  } catch (error) {
    logger.error('Failed to confirm account deletion', error as Error, {
      path: event.path,
    });
    return errorResponse(500, 'INTERNAL_ERROR', 'Failed to confirm account deletion');
  }
};
