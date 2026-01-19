import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, getTableName } from '../lib/dynamodb.js';
import { logger } from '../lib/logger.js';
import { generateUUID } from '../lib/uuid.js';
import { AuditLogEntry, KeyBuilder } from '../types/entities.js';

const TABLE_NAME = getTableName();

export interface AuditLogInput {
  familyId: string;
  memberId: string;
  action: string;
  correlationId: string;
  details?: Record<string, unknown>;
}

export const recordAuditEvent = async (input: AuditLogInput): Promise<AuditLogEntry> => {
  const auditId = generateUUID();
  const now = new Date().toISOString();
  const keys = KeyBuilder.auditLogEntry(input.familyId, auditId, now);

  const entry: AuditLogEntry = {
    ...keys,
    auditId,
    familyId: input.familyId,
    memberId: input.memberId,
    action: input.action,
    details: input.details,
    correlationId: input.correlationId,
    entityType: 'AuditLogEntry',
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: entry,
    })
  );

  logger.info('Audit log entry recorded', {
    auditId,
    familyId: input.familyId,
    action: input.action,
  });

  return entry;
};
