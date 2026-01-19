import { generateUUID } from '../../lib/uuid';
import type { InviteDecisionLogItem, PendingInviteDecisionAction, PendingInviteDecisionSource } from '../../models/invitation';

export interface DecisionLogInput {
  inviteId: string;
  familyId: string;
  actorUserId: string;
  actorMemberId?: string;
  targetEmail?: string;
  targetPhone?: string;
  action: PendingInviteDecisionAction;
  source: PendingInviteDecisionSource;
  message?: string;
  auditCorrelationId: string;
}

export const buildDecisionLogItem = (input: DecisionLogInput): InviteDecisionLogItem => {
  const decisionId = generateUUID();
  const now = new Date().toISOString();

  return {
    PK: `FAMILY#${input.familyId}`,
    SK: `INVITE_DECISION#${now}#${input.inviteId}`,
    GSI1PK: `INVITE#${input.inviteId}`,
    GSI1SK: `DECISION#${now}`,
    decisionId,
    inviteId: input.inviteId,
    familyId: input.familyId,
    actorUserId: input.actorUserId,
    actorMemberId: input.actorMemberId,
    targetEmail: input.targetEmail,
    targetPhone: input.targetPhone,
    action: input.action,
    source: input.source,
    message: input.message,
    createdAt: now,
    auditCorrelationId: input.auditCorrelationId,
    entityType: 'InviteDecisionLog',
  };
};
