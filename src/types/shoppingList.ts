/**
 * Shopping List Type Definitions and Schemas
 * Feature: 002-shopping-lists
 * 
 * Extends the base ShoppingListItem entity with additional attributes
 * for optimistic locking and TTL-based cleanup.
 */

import { z } from 'zod';

/**
 * Shopping list item purchase status
 */
export type ShoppingListStatus = 'pending' | 'purchased';

/**
 * Extended ShoppingListItem Entity - Items to purchase
 * 
 * Extends the base entity with version (optimistic locking) and ttl (auto-cleanup)
 */
export interface ShoppingListItem {
  // Primary identifiers
  shoppingItemId: string; // UUID
  familyId: string; // UUID
  
  // Item details
  itemId: string | null; // UUID of InventoryItem (null for free-text items)
  name: string; // Item name (1-100 characters)
  storeId: string | null; // UUID of Store (null for unassigned)
  status: ShoppingListStatus; // Purchase status
  quantity: number | null; // Optional quantity to purchase (integer > 0)
  notes: string | null; // Optional notes (0-500 characters)
  
  // Concurrency control (NEW in 002-shopping-lists)
  version: number; // Optimistic locking version (starts at 1)
  
  // Automatic cleanup (NEW in 002-shopping-lists)
  ttl: number | null; // Unix timestamp for DynamoDB TTL (null when pending)
  
  // Audit fields
  addedBy: string; // memberId who added the item
  entityType: 'ShoppingListItem';
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
  
  // DynamoDB keys
  PK: string; // FAMILY#{familyId}
  SK: string; // SHOPPING#{shoppingItemId}
  GSI2PK?: string; // FAMILY#{familyId}#SHOPPING
  GSI2SK?: string; // STORE#{storeId}#STATUS#{status}
}

/**
 * Zod Schema for ShoppingListItem validation
 */
export const ShoppingListItemSchema = z.object({
  shoppingItemId: z.string().uuid(),
  familyId: z.string().uuid(),
  itemId: z.string().uuid().nullable(),
  name: z.string().min(1).max(100),
  storeId: z.string().uuid().nullable(),
  status: z.enum(['pending', 'purchased']),
  quantity: z.number().int().positive().nullable(),
  notes: z.string().max(500).nullable(),
  version: z.number().int().min(1),
  ttl: z.number().int().nullable(),
  addedBy: z.string().uuid(),
  entityType: z.literal('ShoppingListItem'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  PK: z.string(),
  SK: z.string(),
  GSI2PK: z.string().optional(),
  GSI2SK: z.string().optional(),
});

/**
 * Create Request Schema
 */
export const CreateShoppingListItemSchema = z.object({
  itemId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(100).optional(),
  storeId: z.string().uuid().nullable().optional(),
  quantity: z.number().int().positive().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  force: z.boolean().optional().default(false),
}).refine(
  (data) => data.itemId || data.name,
  { message: 'Either itemId or name must be provided' }
);

export type CreateShoppingListItemRequest = z.infer<typeof CreateShoppingListItemSchema>;

/**
 * Update Request Schema
 */
export const UpdateShoppingListItemSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  storeId: z.string().uuid().nullable().optional(),
  quantity: z.number().int().positive().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  version: z.number().int().min(1), // Required for optimistic locking
});

export type UpdateShoppingListItemRequest = z.infer<typeof UpdateShoppingListItemSchema>;

/**
 * Status Update Schema
 */
export const UpdateStatusSchema = z.object({
  status: z.enum(['pending', 'purchased']),
  version: z.number().int().min(1), // Required for optimistic locking
});

export type UpdateStatusRequest = z.infer<typeof UpdateStatusSchema>;

/**
 * DynamoDB key construction helpers for Shopping List Items
 */
export const ShoppingListKeyBuilder = {
  /**
   * Build keys for a shopping list item
   */
  item: (
    familyId: string,
    shoppingItemId: string,
    storeId: string | null,
    status: ShoppingListStatus
  ) => ({
    PK: `FAMILY#${familyId}`,
    SK: `SHOPPING#${shoppingItemId}`,
    GSI2PK: `FAMILY#${familyId}#SHOPPING`,
    GSI2SK: `STORE#${storeId || 'UNASSIGNED'}#STATUS#${status}`,
  }),

  /**
   * Build query pattern for listing all shopping items
   */
  listAll: (familyId: string) => ({
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `FAMILY#${familyId}`,
      ':sk': 'SHOPPING#',
    },
  }),

  /**
   * Build query pattern for listing by store
   */
  listByStore: (familyId: string, storeId: string | null) => ({
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :gsi2pk AND begins_with(GSI2SK, :gsi2sk)',
    ExpressionAttributeValues: {
      ':gsi2pk': `FAMILY#${familyId}#SHOPPING`,
      ':gsi2sk': `STORE#${storeId || 'UNASSIGNED'}#`,
    },
  }),

  /**
   * Build query pattern for listing by status
   */
  listByStatus: (familyId: string, status: ShoppingListStatus) => ({
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :gsi2pk',
    FilterExpression: '#status = :status',
    ExpressionAttributeNames: {
      '#status': 'status',
    },
    ExpressionAttributeValues: {
      ':gsi2pk': `FAMILY#${familyId}#SHOPPING`,
      ':status': status,
    },
  }),

  /**
   * Build query pattern for listing by store and status
   */
  listByStoreAndStatus: (
    familyId: string,
    storeId: string | null,
    status: ShoppingListStatus
  ) => ({
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :gsi2pk AND begins_with(GSI2SK, :gsi2sk)',
    ExpressionAttributeValues: {
      ':gsi2pk': `FAMILY#${familyId}#SHOPPING`,
      ':gsi2sk': `STORE#${storeId || 'UNASSIGNED'}#STATUS#${status}`,
    },
  }),

  /**
   * Build query pattern for finding duplicates by itemId
   */
  findDuplicate: (familyId: string, itemId: string) => ({
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    FilterExpression: 'itemId = :itemId AND #status = :pending',
    ExpressionAttributeNames: {
      '#status': 'status',
    },
    ExpressionAttributeValues: {
      ':pk': `FAMILY#${familyId}`,
      ':sk': 'SHOPPING#',
      ':itemId': itemId,
      ':pending': 'pending',
    },
  }),
};

/**
 * TTL calculation helper
 */
export const calculateTTL = (): number => {
  // 7 days from now in Unix timestamp (seconds)
  const now = Date.now();
  const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
  return Math.floor((now + sevenDaysInMs) / 1000);
};

