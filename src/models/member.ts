import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient, getTableName } from '../lib/dynamodb';
import { logger } from '../lib/logger';
import { generateUUID } from '../lib/uuid';
import { Member, MemberInput, KeyBuilder, QueryPatterns } from '../types/entities';

const TABLE_NAME = getTableName();

/**
 * Member Model
 * Handles DynamoDB operations for Member entities
 */
export class MemberModel {
  /**
   * Create a new member
   */
  static async create(input: MemberInput, memberId?: string): Promise<Member> {
    const id = memberId || generateUUID();
    const now = new Date().toISOString();

    const keys = KeyBuilder.member(input.familyId, id);

    const member: Member = {
      ...keys,
      memberId: id,
      familyId: input.familyId,
      email: input.email,
      name: input.name,
      role: input.role,
      // notification fields (optional)
      notificationPreferences: input.notificationPreferences,
      unsubscribeAllEmail: input.unsubscribeAllEmail ?? false,
      timezone: input.timezone,
      status: 'active',
      version: 1, // Initialize version for optimistic locking
      entityType: 'Member',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: member,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );

      logger.info('Member created', { memberId: id, familyId: input.familyId, role: input.role });
      return member;
    } catch (error) {
      logger.error('Failed to create member', error as Error, { input });
      throw error;
    }
  }

  /**
   * Get member by ID
   */
  static async getById(familyId: string, memberId: string): Promise<Member | null> {
    try {
      const keys = KeyBuilder.member(familyId, memberId);
      const result = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: keys.PK, SK: keys.SK },
        })
      );

      if (!result.Item) {
        return null;
      }

      return result.Item as Member;
    } catch (error) {
      logger.error('Failed to get member', error as Error, { familyId, memberId });
      throw error;
    }
  }

  /**
   * Get member by memberId using GSI1 (finds member's family)
   */
  static async getByMemberId(memberId: string): Promise<Member | null> {
    try {
      const queryParams = QueryPatterns.getMemberFamilies(memberId);
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          ...queryParams,
        })
      );

      if (!result.Items || result.Items.length === 0) {
        return null;
      }

      return result.Items[0] as Member;
    } catch (error) {
      logger.error('Failed to get member by memberId', error as Error, { memberId });
      throw error;
    }
  }

  /**
   * List all members in a family
   */
  static async listByFamily(familyId: string): Promise<Member[]> {
    try {
      const queryParams = QueryPatterns.listMembers(familyId);
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          ...queryParams,
        })
      );

      return (result.Items || []) as Member[];
    } catch (error) {
      logger.error('Failed to list members', error as Error, { familyId });
      throw error;
    }
  }

  /**
   * Update member
   */
  static async update(
    familyId: string,
    memberId: string,
    updates: Partial<Pick<Member, 'name' | 'email' | 'role' | 'status' | 'notificationPreferences' | 'unsubscribeAllEmail' | 'timezone'>>
  ): Promise<Member> {
    const now = new Date().toISOString();

    try {
      const updateExpression: string[] = ['#updatedAt = :updatedAt'];
      const expressionAttributeNames: Record<string, string> = { '#updatedAt': 'updatedAt' };
      const expressionAttributeValues: Record<string, unknown> = { ':updatedAt': now };

      if (updates.name !== undefined) {
        updateExpression.push('#name = :name');
        expressionAttributeNames['#name'] = 'name';
        expressionAttributeValues[':name'] = updates.name;
      }

      if (updates.email !== undefined) {
        updateExpression.push('#email = :email');
        expressionAttributeNames['#email'] = 'email';
        expressionAttributeValues[':email'] = updates.email;
      }

      if (updates.role !== undefined) {
        updateExpression.push('#role = :role');
        expressionAttributeNames['#role'] = 'role';
        expressionAttributeValues[':role'] = updates.role;
      }

      if (updates.status !== undefined) {
        updateExpression.push('#status = :status');
        expressionAttributeNames['#status'] = 'status';
        expressionAttributeValues[':status'] = updates.status;
      }

      if (updates.notificationPreferences !== undefined) {
        updateExpression.push('#notificationPreferences = :notificationPreferences');
        expressionAttributeNames['#notificationPreferences'] = 'notificationPreferences';
        expressionAttributeValues[':notificationPreferences'] = updates.notificationPreferences;
      }

      if (updates.unsubscribeAllEmail !== undefined) {
        updateExpression.push('#unsubscribeAllEmail = :unsubscribeAllEmail');
        expressionAttributeNames['#unsubscribeAllEmail'] = 'unsubscribeAllEmail';
        expressionAttributeValues[':unsubscribeAllEmail'] = updates.unsubscribeAllEmail;
      }

      if (updates.timezone !== undefined) {
        updateExpression.push('#timezone = :timezone');
        expressionAttributeNames['#timezone'] = 'timezone';
        expressionAttributeValues[':timezone'] = updates.timezone;
      }

      const keys = KeyBuilder.member(familyId, memberId);
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
        throw new Error('Member not found');
      }

      logger.info('Member updated', { familyId, memberId, updates });
      return result.Attributes as Member;
    } catch (error) {
      logger.error('Failed to update member', error as Error, { familyId, memberId, updates });
      throw error;
    }
  }

  /**
   * Update member with optimistic locking
   */
  static async updateWithVersion(
    familyId: string,
    memberId: string,
    updates: Partial<Pick<Member, 'name' | 'email' | 'role' | 'status' | 'notificationPreferences' | 'unsubscribeAllEmail' | 'timezone'>>,
    expectedVersion: number
  ): Promise<Member> {
    const now = new Date().toISOString();

    try {
      const updateExpression: string[] = ['#updatedAt = :updatedAt', '#version = #version + :one'];
      const expressionAttributeNames: Record<string, string> = {
        '#updatedAt': 'updatedAt',
        '#version': 'version',
      };
      const expressionAttributeValues: Record<string, unknown> = {
        ':updatedAt': now,
        ':one': 1,
        ':expectedVersion': expectedVersion,
      };

      if (updates.name !== undefined) {
        updateExpression.push('#name = :name');
        expressionAttributeNames['#name'] = 'name';
        expressionAttributeValues[':name'] = updates.name;
      }

      if (updates.email !== undefined) {
        updateExpression.push('#email = :email');
        expressionAttributeNames['#email'] = 'email';
        expressionAttributeValues[':email'] = updates.email;
      }

      if (updates.role !== undefined) {
        updateExpression.push('#role = :role');
        expressionAttributeNames['#role'] = 'role';
        expressionAttributeValues[':role'] = updates.role;
      }

      if (updates.status !== undefined) {
        updateExpression.push('#status = :status');
        expressionAttributeNames['#status'] = 'status';
        expressionAttributeValues[':status'] = updates.status;
      }

      if (updates.notificationPreferences !== undefined) {
        updateExpression.push('#notificationPreferences = :notificationPreferences');
        expressionAttributeNames['#notificationPreferences'] = 'notificationPreferences';
        expressionAttributeValues[':notificationPreferences'] = updates.notificationPreferences;
      }

      if (updates.unsubscribeAllEmail !== undefined) {
        updateExpression.push('#unsubscribeAllEmail = :unsubscribeAllEmail');
        expressionAttributeNames['#unsubscribeAllEmail'] = 'unsubscribeAllEmail';
        expressionAttributeValues[':unsubscribeAllEmail'] = updates.unsubscribeAllEmail;
      }

      if (updates.timezone !== undefined) {
        updateExpression.push('#timezone = :timezone');
        expressionAttributeNames['#timezone'] = 'timezone';
        expressionAttributeValues[':timezone'] = updates.timezone;
      }

      const keys = KeyBuilder.member(familyId, memberId);
      const result = await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: keys.PK, SK: keys.SK },
          UpdateExpression: `SET ${updateExpression.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ConditionExpression: 'attribute_exists(PK) AND #version = :expectedVersion',
          ReturnValues: 'ALL_NEW',
        })
      );

      if (!result.Attributes) {
        throw new Error('Member not found');
      }

      logger.info('Member updated with version check', { familyId, memberId, expectedVersion, newVersion: expectedVersion + 1 });
      return result.Attributes as Member;
    } catch (error) {
      if ((error as Error).name === 'ConditionalCheckFailedException') {
        logger.warn('Version conflict detected', { familyId, memberId, expectedVersion });
        throw new Error('VERSION_CONFLICT');
      }
      logger.error('Failed to update member with version', error as Error, { familyId, memberId, updates });
      throw error;
    }
  }

  /**
   * Count active admin members in a family
   */
  static async countAdmins(familyId: string): Promise<number> {
    try {
      const members = await this.listByFamily(familyId);
      return members.filter((m) => m.role === 'admin' && m.status === 'active').length;
    } catch (error) {
      logger.error('Failed to count admins', error as Error, { familyId });
      throw error;
    }
  }

  /**
   * Remove member (soft delete by setting status to 'removed')
   */
  static async remove(familyId: string, memberId: string): Promise<void> {
    try {
      await this.update(familyId, memberId, { status: 'removed' });
      logger.info('Member removed', { familyId, memberId });
    } catch (error) {
      logger.error('Failed to remove member', error as Error, { familyId, memberId });
      throw error;
    }
  }

  /**
   * Delete member (hard delete)
   */
  static async delete(familyId: string, memberId: string): Promise<void> {
    try {
      const keys = KeyBuilder.member(familyId, memberId);
      await docClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { PK: keys.PK, SK: keys.SK },
          ConditionExpression: 'attribute_exists(PK)',
        })
      );

      logger.info('Member deleted', { familyId, memberId });
    } catch (error) {
      logger.error('Failed to delete member', error as Error, { familyId, memberId });
      throw error;
    }
  }

  /**
   * Check if family has at least one admin
   */
  static async hasAdmin(familyId: string): Promise<boolean> {
    try {
      const members = await this.listByFamily(familyId);
      return members.some((m) => m.role === 'admin' && m.status === 'active');
    } catch (error) {
      logger.error('Failed to check for admin', error as Error, { familyId });
      throw error;
    }
  }
}
