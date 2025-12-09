import { FamilyModel } from '../models/family';
import { MemberModel } from '../models/member';
import { logger } from '../lib/logger';
import { Family, FamilyInput, Member, MemberInput } from '../types/entities';

/**
 * FamilyService
 * Business logic for family management
 */
export class FamilyService {
  /**
   * Create a new family with the creating user as the first admin
   */
  static async createFamily(
    familyInput: FamilyInput,
    creatorInfo: { memberId: string; email: string; name: string }
  ): Promise<{ family: Family; member: Member }> {
    try {
      // Create the family
      const family = await FamilyModel.create({
        name: familyInput.name,
        createdBy: creatorInfo.memberId,
      });

      // Add the creator as the first admin member
      const memberInput: MemberInput = {
        familyId: family.familyId,
        email: creatorInfo.email,
        name: creatorInfo.name,
        role: 'admin',
      };

      const member = await MemberModel.create(memberInput, creatorInfo.memberId);

      logger.info('Family created with admin member', { 
        familyId: family.familyId, 
        memberId: member.memberId 
      });

      return { family, member };
    } catch (error) {
      logger.error('Failed to create family', error as Error, { familyInput, creatorInfo });
      throw error;
    }
  }

  /**
   * Get family by ID
   */
  static async getFamily(familyId: string): Promise<Family | null> {
    try {
      return await FamilyModel.getById(familyId);
    } catch (error) {
      logger.error('Failed to get family', error as Error, { familyId });
      throw error;
    }
  }

  /**
   * Update family
   */
  static async updateFamily(
    familyId: string,
    updates: { name?: string }
  ): Promise<Family> {
    try {
      return await FamilyModel.update(familyId, updates);
    } catch (error) {
      logger.error('Failed to update family', error as Error, { familyId, updates });
      throw error;
    }
  }

  /**
   * Add a member to a family
   */
  static async addMember(
    familyId: string,
    memberInput: MemberInput,
    memberId?: string
  ): Promise<Member> {
    try {
      // Verify family exists
      const family = await FamilyModel.getById(familyId);
      if (!family) {
        throw new Error('Family not found');
      }

      // Create the member
      const member = await MemberModel.create(memberInput, memberId);

      logger.info('Member added to family', { familyId, memberId: member.memberId, role: member.role });
      return member;
    } catch (error) {
      logger.error('Failed to add member', error as Error, { familyId, memberInput });
      throw error;
    }
  }

  /**
   * List all members of a family
   */
  static async listMembers(familyId: string): Promise<Member[]> {
    try {
      return await MemberModel.listByFamily(familyId);
    } catch (error) {
      logger.error('Failed to list members', error as Error, { familyId });
      throw error;
    }
  }

  /**
   * Remove a member from a family
   * Validates that at least one admin remains
   */
  static async removeMember(
    familyId: string,
    memberId: string
  ): Promise<void> {
    try {
      // Get the member being removed
      const member = await MemberModel.getById(familyId, memberId);
      if (!member) {
        throw new Error('Member not found');
      }

      // If removing an admin, check that at least one other admin exists
      if (member.role === 'admin') {
        const members = await MemberModel.listByFamily(familyId);
        const activeAdmins = members.filter((m) => 
          m.role === 'admin' && 
          m.status === 'active' && 
          m.memberId !== memberId
        );

        if (activeAdmins.length === 0) {
          throw new Error('Cannot remove the last admin from the family');
        }
      }

      // Remove the member
      await MemberModel.remove(familyId, memberId);

      logger.info('Member removed from family', { familyId, memberId });
    } catch (error) {
      logger.error('Failed to remove member', error as Error, { familyId, memberId });
      throw error;
    }
  }

  /**
   * Update a member's role or details
   */
  static async updateMember(
    familyId: string,
    memberId: string,
    updates: { name?: string; email?: string; role?: 'admin' | 'suggester' }
  ): Promise<Member> {
    try {
      // If changing role from admin, ensure at least one admin remains
      if (updates.role === 'suggester') {
        const member = await MemberModel.getById(familyId, memberId);
        if (member?.role === 'admin') {
          const members = await MemberModel.listByFamily(familyId);
          const activeAdmins = members.filter((m) => 
            m.role === 'admin' && 
            m.status === 'active' && 
            m.memberId !== memberId
          );

          if (activeAdmins.length === 0) {
            throw new Error('Cannot change the role of the last admin');
          }
        }
      }

      return await MemberModel.update(familyId, memberId, updates);
    } catch (error) {
      logger.error('Failed to update member', error as Error, { familyId, memberId, updates });
      throw error;
    }
  }

  /**
   * Delete a family and all its data
   * This is a destructive operation and should be used with caution
   */
  static async deleteFamily(familyId: string, requestingMemberId: string): Promise<void> {
    try {
      // Verify the requesting member is an admin
      const member = await MemberModel.getById(familyId, requestingMemberId);
      if (!member || member.role !== 'admin') {
        throw new Error('Only admins can delete a family');
      }

      // In a production system, we would:
      // 1. Archive or delete all related data (inventory items, shopping lists, etc.)
      // 2. Send notifications to all members
      // 3. Handle the deletion in a transaction or step function
      
      // For now, just delete the family entity
      await FamilyModel.delete(familyId);

      logger.info('Family deleted', { familyId, deletedBy: requestingMemberId });
    } catch (error) {
      logger.error('Failed to delete family', error as Error, { familyId, requestingMemberId });
      throw error;
    }
  }
}
