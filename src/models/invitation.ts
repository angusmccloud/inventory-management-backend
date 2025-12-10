/**
 * Invitation Model - DynamoDB operations for invitations
 * Feature: 003-member-management
 */

import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient, getTableName } from '../lib/dynamodb';
import { logger } from '../lib/logger';
import { generateUUID } from '../lib/uuid';
import {
  Invitation,
  InvitationItem,
  InvitationStatus,
  MemberRole,
  generateInvitationKeys,
  isInvitationExpired,
} from '../types/invitation';

const TABLE_NAME = getTableName();

/**
 * Create invitation input
 */
export interface CreateInvitationInput {
  familyId: string;
  email: string;
  role: MemberRole;
  token: string;
  tokenSignature: string;
  expiresAt: string;
  invitedBy: string;
}

/**
 * Invitation Model
 */
export class InvitationModel {
  /**
   * Create a new invitation
   */
  static async create(input: CreateInvitationInput): Promise<Invitation> {
    const invitationId = generateUUID();
    const now = new Date().toISOString();

    // Calculate TTL (14 days from now)
    const ttlGraceSeconds = parseInt(
      process.env['INVITATION_TTL_GRACE_SECONDS'] || '604800',
      10
    );
    const ttl = Math.floor(new Date(input.expiresAt).getTime() / 1000) + ttlGraceSeconds;

    const keys = generateInvitationKeys(input.familyId, invitationId, input.token);

    const invitation: InvitationItem = {
      ...keys,
      invitationId,
      familyId: input.familyId,
      email: input.email,
      role: input.role,
      token: input.token,
      tokenSignature: input.tokenSignature,
      status: 'pending',
      expiresAt: input.expiresAt,
      ttl,
      invitedBy: input.invitedBy,
      acceptedBy: null,
      acceptedAt: null,
      revokedBy: null,
      revokedAt: null,
      entityType: 'Invitation',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: invitation,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );

      logger.info('Invitation created', {
        invitationId,
        familyId: input.familyId,
        email: input.email,
        role: input.role,
      });

      // Return invitation without DynamoDB keys
      const { PK, SK, GSI1PK, GSI1SK, ...invitationData } = invitation;
      return invitationData;
    } catch (error) {
      logger.error('Failed to create invitation', error as Error, { input });
      throw error;
    }
  }

  /**
   * Get invitation by ID
   */
  static async getById(familyId: string, invitationId: string): Promise<Invitation | null> {
    try {
      const keys = generateInvitationKeys(familyId, invitationId, '');
      const result = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: keys.PK, SK: keys.SK },
        })
      );

      if (!result.Item) {
        return null;
      }

      const { PK, SK, GSI1PK, GSI1SK, ...invitation } = result.Item as InvitationItem;
      return invitation as Invitation;
    } catch (error) {
      logger.error('Failed to get invitation', error as Error, { familyId, invitationId });
      throw error;
    }
  }

  /**
   * Get invitation by token (using GSI1)
   */
  static async getByToken(token: string): Promise<Invitation | null> {
    try {
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :gsi1pk',
          ExpressionAttributeValues: {
            ':gsi1pk': `INVITATION_TOKEN#${token}`,
          },
        })
      );

      if (!result.Items || result.Items.length === 0) {
        return null;
      }

      const { PK, SK, GSI1PK, GSI1SK, ...invitation } = result.Items[0] as InvitationItem;
      return invitation as Invitation;
    } catch (error) {
      logger.error('Failed to get invitation by token', error as Error);
      throw error;
    }
  }

  /**
   * List invitations for a family
   */
  static async listByFamily(
    familyId: string,
    statusFilter?: InvitationStatus
  ): Promise<Invitation[]> {
    try {
      const params: any = {
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `FAMILY#${familyId}`,
          ':sk': 'INVITATION#',
        },
      };

      // Add status filter if provided
      if (statusFilter) {
        params.FilterExpression = '#status = :status';
        params.ExpressionAttributeNames = { '#status': 'status' };
        params.ExpressionAttributeValues[':status'] = statusFilter;
      }

      const result = await docClient.send(new QueryCommand(params));

      return (result.Items || []).map((item) => {
        const { PK, SK, GSI1PK, GSI1SK, ...invitation } = item as InvitationItem;
        return invitation as Invitation;
      });
    } catch (error) {
      logger.error('Failed to list invitations', error as Error, { familyId, statusFilter });
      throw error;
    }
  }

  /**
   * Check for pending invitation by email
   */
  static async findPendingByEmail(familyId: string, email: string): Promise<Invitation | null> {
    try {
      const invitations = await this.listByFamily(familyId, 'pending');
      const found = invitations.find((inv) => inv.email.toLowerCase() === email.toLowerCase());
      return found || null;
    } catch (error) {
      logger.error('Failed to find pending invitation by email', error as Error, {
        familyId,
        email,
      });
      throw error;
    }
  }

  /**
   * Update invitation status
   */
  static async updateStatus(
    familyId: string,
    invitationId: string,
    status: InvitationStatus,
    updateFields?: {
      acceptedBy?: string;
      revokedBy?: string;
    }
  ): Promise<Invitation> {
    const now = new Date().toISOString();
    const keys = generateInvitationKeys(familyId, invitationId, '');

    try {
      const updateExpression: string[] = ['#status = :status', '#updatedAt = :updatedAt'];
      const expressionAttributeNames: Record<string, string> = {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
      };
      const expressionAttributeValues: Record<string, any> = {
        ':status': status,
        ':updatedAt': now,
      };

      if (status === 'accepted' && updateFields?.acceptedBy) {
        updateExpression.push('#acceptedBy = :acceptedBy', '#acceptedAt = :acceptedAt');
        expressionAttributeNames['#acceptedBy'] = 'acceptedBy';
        expressionAttributeNames['#acceptedAt'] = 'acceptedAt';
        expressionAttributeValues[':acceptedBy'] = updateFields.acceptedBy;
        expressionAttributeValues[':acceptedAt'] = now;
      }

      if (status === 'revoked' && updateFields?.revokedBy) {
        updateExpression.push('#revokedBy = :revokedBy', '#revokedAt = :revokedAt');
        expressionAttributeNames['#revokedBy'] = 'revokedBy';
        expressionAttributeNames['#revokedAt'] = 'revokedAt';
        expressionAttributeValues[':revokedBy'] = updateFields.revokedBy;
        expressionAttributeValues[':revokedAt'] = now;
      }

      const result = await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: keys.PK, SK: keys.SK },
          UpdateExpression: `SET ${updateExpression.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ConditionExpression: 'attribute_exists(PK)',
          ReturnValues: 'ALL_NEW',
        })
      );

      if (!result.Attributes) {
        throw new Error('Invitation not found');
      }

      logger.info('Invitation status updated', {
        invitationId,
        familyId,
        status,
      });

      const { PK, SK, GSI1PK, GSI1SK, ...invitation } = result.Attributes as InvitationItem;
      return invitation as Invitation;
    } catch (error) {
      logger.error('Failed to update invitation status', error as Error, {
        invitationId,
        familyId,
        status,
      });
      throw error;
    }
  }

  /**
   * Check if invitation is valid for acceptance
   * Returns { valid: true } or { valid: false, reason: string }
   */
  static validateForAcceptance(invitation: Invitation): { valid: boolean; reason?: string } {
    if (invitation.status !== 'pending') {
      return {
        valid: false,
        reason: `Invitation is ${invitation.status}`,
      };
    }

    if (isInvitationExpired(invitation)) {
      return {
        valid: false,
        reason: 'Invitation has expired',
      };
    }

    return { valid: true };
  }
}

