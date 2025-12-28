/**
 * Unit Tests for Suggestion Service
 * 
 * Tests business logic for suggestion operations including validation,
 * optimistic locking, item snapshot storage, and atomic operations.
 */

import { SuggestionService } from '../../../src/services/suggestions';
import { SuggestionModel } from '../../../src/models/suggestion';
import { InventoryItemModel } from '../../../src/models/inventory-item';
import { MemberModel } from '../../../src/models/member';
import { ShoppingListModel } from '../../../src/models/shopping-list';
import { Suggestion, InventoryItem, Member } from '../../../src/types/entities';

// Mock all dependencies
jest.mock('../../../src/models/suggestion');
jest.mock('../../../src/models/inventory-item');
jest.mock('../../../src/models/member');
jest.mock('../../../src/models/shopping-list');

describe('SuggestionService', () => {
  const familyId = 'test-family-id';
  const memberId = 'test-member-id';
  const itemId = 'test-item-id';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSuggestion', () => {
    it('should validate member role (suggester only)', async () => {
      const adminMember: Member = {
        memberId,
        familyId,
        userId: 'user-id',
        role: 'admin',
        userName: 'Admin User',
        email: 'admin@example.com',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      jest.spyOn(MemberModel, 'getById').mockResolvedValue(adminMember);

      await expect(
        SuggestionService.createSuggestion(familyId, memberId, {
          type: 'add_to_shopping',
          itemId,
          notes: 'Test note',
        })
      ).rejects.toThrow('Only suggester role members can create suggestions');
    });

    it('should validate item existence for add_to_shopping type', async () => {
      const suggesterMember: Member = {
        memberId,
        familyId,
        userId: 'user-id',
        role: 'suggester',
        userName: 'Suggester User',
        email: 'suggester@example.com',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      jest.spyOn(MemberModel, 'getById').mockResolvedValue(suggesterMember);
      jest.spyOn(InventoryItemModel, 'getById').mockResolvedValue(null);

      await expect(
        SuggestionService.createSuggestion(familyId, memberId, {
          type: 'add_to_shopping',
          itemId,
          notes: 'Test note',
        })
      ).rejects.toThrow('Item not found');
    });

    it('should store item snapshot for add_to_shopping type', async () => {
      const suggesterMember: Member = {
        memberId,
        familyId,
        userId: 'user-id',
        role: 'suggester',
        userName: 'Suggester User',
        email: 'suggester@example.com',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const inventoryItem: InventoryItem = {
        itemId,
        familyId,
        name: 'Test Item',
        quantity: 5,
        lowStockThreshold: 2,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'admin-id',
        updatedBy: 'admin-id',
      };

      const createdSuggestion: Suggestion = {
        suggestionId: 'suggestion-id',
        familyId,
        suggestedBy: memberId,
        suggestedByName: 'Suggester User',
        type: 'add_to_shopping',
        itemId,
        itemNameSnapshot: 'Test Item',
        status: 'pending',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notes: 'Test note',
      };

      jest.spyOn(MemberModel, 'getById').mockResolvedValue(suggesterMember);
      jest.spyOn(InventoryItemModel, 'getById').mockResolvedValue(inventoryItem);
      jest.spyOn(SuggestionModel, 'create').mockResolvedValue(createdSuggestion);

      const result = await SuggestionService.createSuggestion(familyId, memberId, {
        type: 'add_to_shopping',
        itemId,
        notes: 'Test note',
      });

      expect(result.itemNameSnapshot).toBe('Test Item');
      expect(SuggestionModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          itemNameSnapshot: 'Test Item',
        })
      );
    });

    it('should validate item name uniqueness for create_item type', async () => {
      const suggesterMember: Member = {
        memberId,
        familyId,
        userId: 'user-id',
        role: 'suggester',
        userName: 'Suggester User',
        email: 'suggester@example.com',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      jest.spyOn(MemberModel, 'getById').mockResolvedValue(suggesterMember);
      jest.spyOn(SuggestionService, 'validateItemNameUnique').mockResolvedValue(false);

      await expect(
        SuggestionService.createSuggestion(familyId, memberId, {
          type: 'create_item',
          proposedItemName: 'Duplicate Item',
          proposedQuantity: 10,
          proposedThreshold: 2,
        })
      ).rejects.toThrow('Item name already exists');
    });

    it('should create suggestion with initial version 1', async () => {
      const suggesterMember: Member = {
        memberId,
        familyId,
        userId: 'user-id',
        role: 'suggester',
        userName: 'Suggester User',
        email: 'suggester@example.com',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const createdSuggestion: Suggestion = {
        suggestionId: 'suggestion-id',
        familyId,
        suggestedBy: memberId,
        suggestedByName: 'Suggester User',
        type: 'create_item',
        proposedItemName: 'New Item',
        proposedQuantity: 10,
        proposedThreshold: 2,
        status: 'pending',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      jest.spyOn(MemberModel, 'getById').mockResolvedValue(suggesterMember);
      jest.spyOn(SuggestionService, 'validateItemNameUnique').mockResolvedValue(true);
      jest.spyOn(SuggestionModel, 'create').mockResolvedValue(createdSuggestion);

      const result = await SuggestionService.createSuggestion(familyId, memberId, {
        type: 'create_item',
        proposedItemName: 'New Item',
        proposedQuantity: 10,
        proposedThreshold: 2,
      });

      expect(result.version).toBe(1);
      expect(result.status).toBe('pending');
    });
  });

  describe('approveSuggestion', () => {
    it('should check optimistic locking (status=pending AND version match)', async () => {
      const existingSuggestion: Suggestion = {
        suggestionId: 'suggestion-id',
        familyId,
        suggestedBy: memberId,
        suggestedByName: 'Suggester User',
        type: 'add_to_shopping',
        itemId,
        itemNameSnapshot: 'Test Item',
        status: 'approved',
        version: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      jest.spyOn(SuggestionModel, 'getById').mockResolvedValue(existingSuggestion);

      await expect(
        SuggestionService.approveSuggestion(familyId, 'suggestion-id', 'reviewer-id', 'Reviewer Name')
      ).rejects.toThrow('Suggestion has already been reviewed');
    });

    it('should reject if referenced item is deleted (orphaned item check)', async () => {
      const existingSuggestion: Suggestion = {
        suggestionId: 'suggestion-id',
        familyId,
        suggestedBy: memberId,
        suggestedByName: 'Suggester User',
        type: 'add_to_shopping',
        itemId,
        itemNameSnapshot: 'Test Item',
        status: 'pending',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      jest.spyOn(SuggestionModel, 'getById').mockResolvedValue(existingSuggestion);
      jest.spyOn(InventoryItemModel, 'getById').mockResolvedValue(null);

      await expect(
        SuggestionService.approveSuggestion(familyId, 'suggestion-id', 'reviewer-id', 'Reviewer Name')
      ).rejects.toThrow('Referenced item has been deleted');
    });

    it('should validate item name uniqueness before create_item approval', async () => {
      const existingSuggestion: Suggestion = {
        suggestionId: 'suggestion-id',
        familyId,
        suggestedBy: memberId,
        suggestedByName: 'Suggester User',
        type: 'create_item',
        proposedItemName: 'New Item',
        proposedQuantity: 10,
        proposedThreshold: 2,
        status: 'pending',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      jest.spyOn(SuggestionModel, 'getById').mockResolvedValue(existingSuggestion);
      jest.spyOn(SuggestionService, 'validateItemNameUnique').mockResolvedValue(false);

      await expect(
        SuggestionService.approveSuggestion(familyId, 'suggestion-id', 'reviewer-id', 'Reviewer Name')
      ).rejects.toThrow('Item name already exists');
    });

    it('should use TransactWriteItems for atomic add_to_shopping approval', async () => {
      const existingSuggestion: Suggestion = {
        suggestionId: 'suggestion-id',
        familyId,
        suggestedBy: memberId,
        suggestedByName: 'Suggester User',
        type: 'add_to_shopping',
        itemId,
        itemNameSnapshot: 'Test Item',
        status: 'pending',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const inventoryItem: InventoryItem = {
        itemId,
        familyId,
        name: 'Test Item',
        quantity: 5,
        lowStockThreshold: 2,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'admin-id',
        updatedBy: 'admin-id',
      };

      const updatedSuggestion: Suggestion = {
        ...existingSuggestion,
        status: 'approved',
        reviewedBy: 'reviewer-id',
        reviewedAt: new Date().toISOString(),
        version: 2,
      };

      jest.spyOn(SuggestionModel, 'getById').mockResolvedValue(existingSuggestion);
      jest.spyOn(InventoryItemModel, 'getById').mockResolvedValue(inventoryItem);
      jest.spyOn(SuggestionModel, 'updateStatus').mockResolvedValue(updatedSuggestion);
      jest.spyOn(ShoppingListModel, 'create').mockResolvedValue({} as any);

      const result = await SuggestionService.approveSuggestion(
        familyId,
        'suggestion-id',
        'reviewer-id',
        'Reviewer Name'
      );

      expect(result.status).toBe('approved');
      expect(result.reviewedBy).toBe('reviewer-id');
      expect(result.version).toBe(2);
    });

    it('should use TransactWriteItems for atomic create_item approval', async () => {
      const existingSuggestion: Suggestion = {
        suggestionId: 'suggestion-id',
        familyId,
        suggestedBy: memberId,
        suggestedByName: 'Suggester User',
        type: 'create_item',
        proposedItemName: 'New Item',
        proposedQuantity: 10,
        proposedThreshold: 2,
        status: 'pending',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const updatedSuggestion: Suggestion = {
        ...existingSuggestion,
        status: 'approved',
        reviewedBy: 'reviewer-id',
        reviewedAt: new Date().toISOString(),
        version: 2,
      };

      jest.spyOn(SuggestionModel, 'getById').mockResolvedValue(existingSuggestion);
      jest.spyOn(SuggestionService, 'validateItemNameUnique').mockResolvedValue(true);
      jest.spyOn(SuggestionModel, 'updateStatus').mockResolvedValue(updatedSuggestion);
      jest.spyOn(InventoryItemModel, 'create').mockResolvedValue({} as any);

      const result = await SuggestionService.approveSuggestion(
        familyId,
        'suggestion-id',
        'reviewer-id',
        'Reviewer Name'
      );

      expect(result.status).toBe('approved');
      expect(result.reviewedBy).toBe('reviewer-id');
      expect(InventoryItemModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Item',
          quantity: 10,
          lowStockThreshold: 2,
        })
      );
    });
  });

  describe('rejectSuggestion', () => {
    it('should check optimistic locking (status=pending AND version match)', async () => {
      const existingSuggestion: Suggestion = {
        suggestionId: 'suggestion-id',
        familyId,
        suggestedBy: memberId,
        suggestedByName: 'Suggester User',
        type: 'add_to_shopping',
        itemId,
        itemNameSnapshot: 'Test Item',
        status: 'rejected',
        version: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      jest.spyOn(SuggestionModel, 'getById').mockResolvedValue(existingSuggestion);

      await expect(
        SuggestionService.rejectSuggestion(
          familyId,
          'suggestion-id',
          'reviewer-id',
          'Reviewer Name',
          'Not needed'
        )
      ).rejects.toThrow('Suggestion has already been reviewed');
    });

    it('should accept optional rejection notes', async () => {
      const existingSuggestion: Suggestion = {
        suggestionId: 'suggestion-id',
        familyId,
        suggestedBy: memberId,
        suggestedByName: 'Suggester User',
        type: 'create_item',
        proposedItemName: 'New Item',
        proposedQuantity: 10,
        proposedThreshold: 2,
        status: 'pending',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const updatedSuggestion: Suggestion = {
        ...existingSuggestion,
        status: 'rejected',
        reviewedBy: 'reviewer-id',
        reviewedAt: new Date().toISOString(),
        rejectionNotes: 'Not needed',
        version: 2,
      };

      jest.spyOn(SuggestionModel, 'getById').mockResolvedValue(existingSuggestion);
      jest.spyOn(SuggestionModel, 'updateStatus').mockResolvedValue(updatedSuggestion);

      const result = await SuggestionService.rejectSuggestion(
        familyId,
        'suggestion-id',
        'reviewer-id',
        'Reviewer Name',
        'Not needed'
      );

      expect(result.status).toBe('rejected');
      expect(result.rejectionNotes).toBe('Not needed');
      expect(result.version).toBe(2);
    });

    it('should increment version number on rejection', async () => {
      const existingSuggestion: Suggestion = {
        suggestionId: 'suggestion-id',
        familyId,
        suggestedBy: memberId,
        suggestedByName: 'Suggester User',
        type: 'add_to_shopping',
        itemId,
        itemNameSnapshot: 'Test Item',
        status: 'pending',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const updatedSuggestion: Suggestion = {
        ...existingSuggestion,
        status: 'rejected',
        reviewedBy: 'reviewer-id',
        reviewedAt: new Date().toISOString(),
        version: 2,
      };

      jest.spyOn(SuggestionModel, 'getById').mockResolvedValue(existingSuggestion);
      jest.spyOn(SuggestionModel, 'updateStatus').mockResolvedValue(updatedSuggestion);

      const result = await SuggestionService.rejectSuggestion(
        familyId,
        'suggestion-id',
        'reviewer-id',
        'Reviewer Name'
      );

      expect(result.version).toBe(2);
    });
  });

  describe('validateItemNameUnique', () => {
    it('should return false if item name already exists', async () => {
      const existingItem: InventoryItem = {
        itemId: 'existing-item-id',
        familyId,
        name: 'Existing Item',
        quantity: 5,
        lowStockThreshold: 2,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'admin-id',
        updatedBy: 'admin-id',
      };

      jest.spyOn(InventoryItemModel, 'listByFamily').mockResolvedValue({
        items: [existingItem],
        nextToken: undefined,
      });

      const result = await SuggestionService.validateItemNameUnique(familyId, 'Existing Item');

      expect(result).toBe(false);
    });

    it('should return true if item name is unique', async () => {
      jest.spyOn(InventoryItemModel, 'listByFamily').mockResolvedValue({
        items: [],
        nextToken: undefined,
      });

      const result = await SuggestionService.validateItemNameUnique(familyId, 'Unique Item');

      expect(result).toBe(true);
    });

    it('should perform case-insensitive comparison', async () => {
      const existingItem: InventoryItem = {
        itemId: 'existing-item-id',
        familyId,
        name: 'Existing Item',
        quantity: 5,
        lowStockThreshold: 2,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'admin-id',
        updatedBy: 'admin-id',
      };

      jest.spyOn(InventoryItemModel, 'listByFamily').mockResolvedValue({
        items: [existingItem],
        nextToken: undefined,
      });

      const result = await SuggestionService.validateItemNameUnique(familyId, 'existing item');

      expect(result).toBe(false);
    });
  });
});
