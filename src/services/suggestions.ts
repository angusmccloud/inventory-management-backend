import { SuggestionModel, CreateSuggestionInput, ListSuggestionsOptions } from '../models/suggestion';
import { InventoryItemModel } from '../models/inventory';
import { MemberModel } from '../models/member';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, getTableName } from '../lib/dynamodb';
import { logger } from '../lib/logger';
import { generateUUID } from '../lib/uuid';
import { Suggestion, SuggestionType, KeyBuilder } from '../types/entities';
import { ShoppingListItem } from '../types/shoppingList';

const TABLE_NAME = getTableName();

/**
 * SuggestionService
 * Business logic for suggestion management
 */
export class SuggestionService {
  /**
   * Create a new suggestion
   * Validates suggester role and item existence for add_to_shopping type
   */
  static async createSuggestion(
    familyId: string,
    suggestedBy: string,
    type: SuggestionType,
    data: {
      itemId?: string;
      proposedItemName?: string;
      proposedQuantity?: number;
      proposedThreshold?: number;
      notes?: string | null;
    }
  ): Promise<Suggestion> {
    try {
      // Get member to validate role and get name
      const member = await MemberModel.getById(familyId, suggestedBy);
      if (!member) {
        throw new Error('Member not found');
      }

      if (member.role !== 'suggester') {
        throw new Error('Only suggester role members can create suggestions');
      }

      if (member.status !== 'active') {
        throw new Error('Inactive members cannot create suggestions');
      }

      let input: CreateSuggestionInput = {
        familyId,
        suggestedBy,
        suggestedByName: member.name,
        type,
        notes: data.notes || null,
      };

      // Validate based on suggestion type
      if (type === 'add_to_shopping') {
        if (!data.itemId) {
          throw new Error('itemId is required for add_to_shopping suggestions');
        }

        // Validate item exists and is active
        const item = await InventoryItemModel.getById(familyId, data.itemId);
        if (!item) {
          throw new Error('Inventory item not found');
        }

        if (item.status !== 'active') {
          throw new Error('Cannot suggest archived items');
        }

        input.itemId = data.itemId;
        input.itemNameSnapshot = item.name;
      } else if (type === 'create_item') {
        if (!data.proposedItemName || data.proposedQuantity === undefined || data.proposedThreshold === undefined) {
          throw new Error('proposedItemName, proposedQuantity, and proposedThreshold are required for create_item suggestions');
        }

        input.proposedItemName = data.proposedItemName;
        input.proposedQuantity = data.proposedQuantity;
        input.proposedThreshold = data.proposedThreshold;
      }

      return await SuggestionModel.create(input);
    } catch (error) {
      logger.error('Failed to create suggestion', error as Error, { familyId, suggestedBy, type });
      throw error;
    }
  }

  /**
   * List suggestions for a family with optional filtering
   */
  static async listSuggestions(
    familyId: string,
    options: ListSuggestionsOptions = {}
  ): Promise<{ suggestions: Suggestion[]; nextToken?: string }> {
    try {
      return await SuggestionModel.listByFamily(familyId, options);
    } catch (error) {
      logger.error('Failed to list suggestions', error as Error, { familyId, options });
      throw error;
    }
  }

  /**
   * Get a single suggestion
   */
  static async getSuggestion(familyId: string, suggestionId: string): Promise<Suggestion | null> {
    try {
      return await SuggestionModel.getById(familyId, suggestionId);
    } catch (error) {
      logger.error('Failed to get suggestion', error as Error, { familyId, suggestionId });
      throw error;
    }
  }

  /**
   * Approve a suggestion
   * For add_to_shopping: creates ShoppingListItem
   * For create_item: creates InventoryItem
   * Uses atomic transaction to ensure consistency
   */
  static async approveSuggestion(
    familyId: string,
    suggestionId: string,
    reviewedBy: string
  ): Promise<Suggestion> {
    try {
      // Get member to validate role
      const member = await MemberModel.getById(familyId, reviewedBy);
      if (!member) {
        throw new Error('Member not found');
      }

      if (member.role !== 'admin') {
        throw new Error('Only admin role members can approve suggestions');
      }

      // Get suggestion
      const suggestion = await SuggestionModel.getById(familyId, suggestionId);
      if (!suggestion) {
        throw new Error('Suggestion not found');
      }

      if (suggestion.status !== 'pending') {
        throw new Error('Only pending suggestions can be approved');
      }

      const now = new Date().toISOString();

      if (suggestion.type === 'add_to_shopping') {
        // Validate item still exists and is active
        if (!suggestion.itemId) {
          throw new Error('Suggestion missing itemId');
        }

        const item = await InventoryItemModel.getById(familyId, suggestion.itemId);
        if (!item) {
          throw new Error('Referenced inventory item no longer exists');
        }

        if (item.status !== 'active') {
          throw new Error('Referenced inventory item is archived');
        }

        // Create shopping list item atomically with suggestion approval
        const shoppingItemId = generateUUID();
        const shoppingKeys = KeyBuilder.shoppingListItem(
          familyId,
          shoppingItemId,
          item.preferredStoreId || 'NONE',
          false
        );

        const shoppingItem: ShoppingListItem = {
          ...shoppingKeys,
          shoppingItemId,
          familyId,
          itemId: item.itemId, // Use itemId not inventoryItemId
          name: item.name, // Use name not itemName
          storeId: item.preferredStoreId || null,
          storeName: item.preferredStoreName || null,
          status: 'pending' as const, // Use status not isPurchased
          quantity: 1, // Default quantity
          notes: `Added from suggestion by ${suggestion.suggestedByName}`,
          addedBy: reviewedBy,
          version: 1,
          ttl: null,
          entityType: 'ShoppingListItem',
          createdAt: now,
          updatedAt: now,
        };

        // Update suggestion keys for approved status
        const newSuggestionKeys = KeyBuilder.suggestion(
          familyId,
          suggestionId,
          'approved',
          suggestion.createdAt
        );

        // Atomic transaction: update suggestion + create shopping item
        await docClient.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
                  TableName: TABLE_NAME,
                  Key: {
                    PK: `FAMILY#${familyId}`,
                    SK: `SUGGESTION#${suggestionId}`,
                  },
                  UpdateExpression:
                    'SET #status = :status, reviewedBy = :reviewedBy, reviewedAt = :reviewedAt, ' +
                    '#version = :newVersion, updatedAt = :updatedAt, GSI2SK = :gsi2sk',
                  ConditionExpression: '#status = :pendingStatus AND #version = :currentVersion',
                  ExpressionAttributeNames: {
                    '#status': 'status',
                    '#version': 'version',
                  },
                  ExpressionAttributeValues: {
                    ':status': 'approved',
                    ':reviewedBy': reviewedBy,
                    ':reviewedAt': now,
                    ':newVersion': suggestion.version + 1,
                    ':updatedAt': now,
                    ':pendingStatus': 'pending',
                    ':currentVersion': suggestion.version,
                    ':gsi2sk': newSuggestionKeys.GSI2SK,
                  },
                },
              },
              {
                Put: {
                  TableName: TABLE_NAME,
                  Item: shoppingItem,
                  ConditionExpression: 'attribute_not_exists(PK)',
                },
              },
            ],
          })
        );

        logger.info('Suggestion approved - shopping item created', {
          suggestionId,
          familyId,
          shoppingItemId,
        });

        // Return updated suggestion
        return {
          ...suggestion,
          status: 'approved',
          reviewedBy,
          reviewedAt: now,
          version: suggestion.version + 1,
          updatedAt: now,
        };
      } else if (suggestion.type === 'create_item') {
        // Validate item name is unique
        if (!suggestion.proposedItemName) {
          throw new Error('Suggestion missing proposedItemName');
        }

        const existingItems = await InventoryItemModel.listByFamily(familyId, false);
        const nameConflict = existingItems.find(
          (item) => item.name.toLowerCase() === suggestion.proposedItemName!.toLowerCase()
        );

        if (nameConflict) {
          throw new Error('An item with this name already exists');
        }

        // Create inventory item atomically with suggestion approval
        const itemId = generateUUID();
        const itemKeys = KeyBuilder.inventoryItem(
          familyId,
          itemId,
          'active',
          suggestion.proposedQuantity || 0
        );

        const newItem = {
          ...itemKeys,
          itemId,
          familyId,
          name: suggestion.proposedItemName,
          quantity: suggestion.proposedQuantity || 0,
          unit: null,
          locationId: null,
          locationName: null,
          preferredStoreId: null,
          preferredStoreName: null,
          lowStockThreshold: suggestion.proposedThreshold || 0,
          status: 'active',
          notes: `Created from suggestion by ${suggestion.suggestedByName}`,
          createdBy: reviewedBy,
          lastModifiedBy: reviewedBy,
          entityType: 'InventoryItem',
          createdAt: now,
          updatedAt: now,
        };

        // Update suggestion keys for approved status
        const newSuggestionKeys = KeyBuilder.suggestion(
          familyId,
          suggestionId,
          'approved',
          suggestion.createdAt
        );

        // Also create a shopping list item for the new inventory item
        const shoppingItemId = generateUUID();
        const shoppingKeys = KeyBuilder.shoppingListItem(
          familyId,
          shoppingItemId,
          'NONE', // No store assigned
          false // isPurchased = false
        );

        const shoppingItem = {
          ...shoppingKeys,
          shoppingItemId,
          familyId,
          itemId: itemId, // Link to inventory item
          name: suggestion.proposedItemName, // Use 'name' not 'itemName'
          storeId: null,
          status: 'pending' as const,
          quantity: 1, // Default quantity for shopping
          notes: `Added from suggestion by ${suggestion.suggestedByName}`,
          addedBy: reviewedBy,
          version: 1,
          entityType: 'ShoppingListItem',
          createdAt: now,
          updatedAt: now,
        };

        // Atomic transaction: update suggestion + create inventory item + create shopping item
        await docClient.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
                  TableName: TABLE_NAME,
                  Key: {
                    PK: `FAMILY#${familyId}`,
                    SK: `SUGGESTION#${suggestionId}`,
                  },
                  UpdateExpression:
                    'SET #status = :status, reviewedBy = :reviewedBy, reviewedAt = :reviewedAt, ' +
                    '#version = :newVersion, updatedAt = :updatedAt, GSI2SK = :gsi2sk',
                  ConditionExpression: '#status = :pendingStatus AND #version = :currentVersion',
                  ExpressionAttributeNames: {
                    '#status': 'status',
                    '#version': 'version',
                  },
                  ExpressionAttributeValues: {
                    ':status': 'approved',
                    ':reviewedBy': reviewedBy,
                    ':reviewedAt': now,
                    ':newVersion': suggestion.version + 1,
                    ':updatedAt': now,
                    ':pendingStatus': 'pending',
                    ':currentVersion': suggestion.version,
                    ':gsi2sk': newSuggestionKeys.GSI2SK,
                  },
                },
              },
              {
                Put: {
                  TableName: TABLE_NAME,
                  Item: newItem,
                  ConditionExpression: 'attribute_not_exists(PK)',
                },
              },
              {
                Put: {
                  TableName: TABLE_NAME,
                  Item: shoppingItem,
                  ConditionExpression: 'attribute_not_exists(PK)',
                },
              },
            ],
          })
        );

        logger.info('Suggestion approved - inventory item and shopping item created', {
          suggestionId,
          familyId,
          itemId,
          shoppingItemId,
        });

        // Return updated suggestion
        return {
          ...suggestion,
          status: 'approved',
          reviewedBy,
          reviewedAt: now,
          version: suggestion.version + 1,
          updatedAt: now,
        };
      }

      throw new Error(`Unknown suggestion type: ${suggestion.type}`);
    } catch (error) {
      // Check for transaction failures
      if ((error as { name?: string }).name === 'TransactionCanceledException') {
        logger.warn('Suggestion approval transaction failed', {
          suggestionId,
          familyId,
        });
        throw new Error('Suggestion has already been reviewed or a conflict occurred');
      }
      logger.error('Failed to approve suggestion', error as Error, { familyId, suggestionId });
      throw error;
    }
  }

  /**
   * Reject a suggestion
   */
  static async rejectSuggestion(
    familyId: string,
    suggestionId: string,
    reviewedBy: string,
    rejectionNotes?: string | null
  ): Promise<Suggestion> {
    try {
      // Get member to validate role
      const member = await MemberModel.getById(familyId, reviewedBy);
      if (!member) {
        throw new Error('Member not found');
      }

      if (member.role !== 'admin') {
        throw new Error('Only admin role members can reject suggestions');
      }

      // Get suggestion to validate and get version
      const suggestion = await SuggestionModel.getById(familyId, suggestionId);
      if (!suggestion) {
        throw new Error('Suggestion not found');
      }

      if (suggestion.status !== 'pending') {
        throw new Error('Only pending suggestions can be rejected');
      }

      return await SuggestionModel.updateStatus(
        familyId,
        suggestionId,
        'rejected',
        reviewedBy,
        suggestion.version,
        rejectionNotes
      );
    } catch (error) {
      logger.error('Failed to reject suggestion', error as Error, { familyId, suggestionId });
      throw error;
    }
  }

  /**
   * Validate item name uniqueness (for create_item suggestions)
   */
  static async validateItemNameUnique(familyId: string, itemName: string): Promise<boolean> {
    try {
      const items = await InventoryItemModel.listByFamily(familyId, false);
      const conflict = items.find(
        (item) => item.name.toLowerCase() === itemName.toLowerCase()
      );
      return !conflict;
    } catch (error) {
      logger.error('Failed to validate item name uniqueness', error as Error, { familyId, itemName });
      throw error;
    }
  }
}
