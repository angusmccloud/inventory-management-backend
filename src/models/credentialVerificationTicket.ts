import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, getTableName } from '../lib/dynamodb.js';
import { logger } from '../lib/logger.js';
import { generateUUID } from '../lib/uuid.js';
import {
  CredentialActionType,
  CredentialTicketStatus,
  CredentialVerificationTicket,
  KeyBuilder,
} from '../types/entities.js';

const TABLE_NAME = getTableName();

export interface CredentialVerificationTicketInput {
  familyId: string;
  memberId: string;
  actionType: CredentialActionType;
  expiresAt: string;
  ttl: number;
  newEmail?: string;
}

export class CredentialVerificationTicketModel {
  static async create(
    input: CredentialVerificationTicketInput,
    ticketId?: string
  ): Promise<CredentialVerificationTicket> {
    const id = ticketId || generateUUID();
    const now = new Date().toISOString();
    const keys = KeyBuilder.credentialVerificationTicket(input.familyId, id);

    const ticket: CredentialVerificationTicket = {
      ...keys,
      ticketId: id,
      familyId: input.familyId,
      memberId: input.memberId,
      actionType: input.actionType,
      status: 'pending',
      issuedAt: now,
      expiresAt: input.expiresAt,
      ttl: input.ttl,
      newEmail: input.newEmail,
      entityType: 'CredentialVerificationTicket',
      createdAt: now,
      updatedAt: now,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: ticket,
        ConditionExpression: 'attribute_not_exists(PK)',
      })
    );

    logger.info('Credential verification ticket created', {
      ticketId: id,
      familyId: input.familyId,
      actionType: input.actionType,
    });

    return ticket;
  }

  static async getById(
    familyId: string,
    ticketId: string
  ): Promise<CredentialVerificationTicket | null> {
    const keys = KeyBuilder.credentialVerificationTicket(familyId, ticketId);
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: keys.PK, SK: keys.SK },
      })
    );

    return (result.Item as CredentialVerificationTicket) || null;
  }

  static async updateStatus(
    familyId: string,
    ticketId: string,
    status: CredentialTicketStatus
  ): Promise<CredentialVerificationTicket> {
    const now = new Date().toISOString();
    const keys = KeyBuilder.credentialVerificationTicket(familyId, ticketId);

    const result = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: keys.PK, SK: keys.SK },
        UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':status': status,
          ':updatedAt': now,
        },
        ConditionExpression: 'attribute_exists(PK)',
        ReturnValues: 'ALL_NEW',
      })
    );

    return result.Attributes as CredentialVerificationTicket;
  }
}
