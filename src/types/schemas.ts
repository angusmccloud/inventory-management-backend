/**
 * Zod Validation Schemas - Family Inventory Management System
 * 
 * Runtime validation schemas for all entity types and API requests.
 * Ensures data integrity and type safety at runtime.
 */

import { z } from 'zod';

/**
 * Common validation patterns
 */
const uuidSchema = z.string().uuid('Invalid UUID format');
const emailSchema = z.string().email('Invalid email format');
const isoDateSchema = z.string().datetime('Invalid ISO 8601 datetime');
const nonEmptyString = z.string().min(1, 'Cannot be empty');

/**
 * Entity type enum
 */
export const entityTypeSchema = z.enum([
  'Family',
  'Member',
  'InventoryItem',
  'StorageLocation',
  'Store',
  'ShoppingListItem',
  'Notification',
  'Suggestion',
]);

/**
 * Member role schema
 */
export const memberRoleSchema = z.enum(['admin', 'suggester'], {
  errorMap: () => ({ message: 'Role must be "admin" or "suggester"' }),
});

/**
 * Member status schema
 */
export const memberStatusSchema = z.enum(['active', 'removed']);

/**
 * Item status schema
 */
export const itemStatusSchema = z.enum(['active', 'archived']);

/**
 * Notification type schema
 */
export const notificationTypeSchema = z.enum(['low_stock', 'system', 'suggestion_response']);

/**
 * Notification status schema
 */
export const notificationStatusSchema = z.enum(['unread', 'read']);

/**
 * Suggestion status schema
 */
export const suggestionStatusSchema = z.enum(['pending', 'approved', 'rejected']);

/**
 * Suggestion type schema
 */
export const suggestionTypeSchema = z.enum(['add_item', 'add_to_shopping_list', 'other']);

/**
 * Family Entity Schema
 */
export const familySchema = z.object({
  familyId: uuidSchema,
  name: z.string().min(1).max(100, 'Family name must be 1-100 characters'),
  createdBy: uuidSchema,
  entityType: z.literal('Family'),
  PK: nonEmptyString,
  SK: nonEmptyString,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

/**
 * Member Entity Schema
 */
export const memberSchema = z.object({
  memberId: uuidSchema,
  familyId: uuidSchema,
  email: emailSchema,
  name: z.string().min(1).max(100, 'Name must be 1-100 characters'),
  role: memberRoleSchema,
  status: memberStatusSchema,
  entityType: z.literal('Member'),
  PK: nonEmptyString,
  SK: nonEmptyString,
  GSI1PK: nonEmptyString.optional(),
  GSI1SK: nonEmptyString.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

/**
 * InventoryItem Entity Schema
 */
export const inventoryItemSchema = z.object({
  itemId: uuidSchema,
  familyId: uuidSchema,
  name: z.string().min(1).max(200, 'Item name must be 1-200 characters'),
  quantity: z.number().nonnegative('Quantity cannot be negative'),
  unit: z.string().max(50, 'Unit must be at most 50 characters').optional(),
  locationId: uuidSchema.optional(),
  locationName: z.string().max(100).optional(),
  preferredStoreId: uuidSchema.optional(),
  preferredStoreName: z.string().max(100).optional(),
  lowStockThreshold: z.number().nonnegative('Low stock threshold cannot be negative'),
  status: itemStatusSchema,
  notes: z.string().max(500, 'Notes must be at most 500 characters').optional(),
  createdBy: uuidSchema,
  lastModifiedBy: uuidSchema,
  entityType: z.literal('InventoryItem'),
  PK: nonEmptyString,
  SK: nonEmptyString,
  GSI2PK: nonEmptyString.optional(),
  GSI2SK: nonEmptyString.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

/**
 * StorageLocation Entity Schema
 */
export const storageLocationSchema = z.object({
  locationId: uuidSchema,
  familyId: uuidSchema,
  name: z.string().min(1).max(100, 'Location name must be 1-100 characters'),
  description: z.string().max(500, 'Description must be at most 500 characters').optional(),
  entityType: z.literal('StorageLocation'),
  PK: nonEmptyString,
  SK: nonEmptyString,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

/**
 * Store Entity Schema
 */
export const storeSchema = z.object({
  storeId: uuidSchema,
  familyId: uuidSchema,
  name: z.string().min(1).max(100, 'Store name must be 1-100 characters'),
  address: z.string().max(500, 'Address must be at most 500 characters').optional(),
  notes: z.string().max(500, 'Notes must be at most 500 characters').optional(),
  entityType: z.literal('Store'),
  PK: nonEmptyString,
  SK: nonEmptyString,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

/**
 * ShoppingListItem Entity Schema
 */
export const shoppingListItemSchema = z.object({
  shoppingItemId: uuidSchema,
  familyId: uuidSchema,
  inventoryItemId: uuidSchema.optional(),
  itemName: z.string().min(1).max(200, 'Item name must be 1-200 characters'),
  quantity: z.number().positive('Quantity must be positive'),
  unit: z.string().max(50, 'Unit must be at most 50 characters').optional(),
  storeId: uuidSchema.optional(),
  storeName: z.string().max(100).optional(),
  isPurchased: z.boolean(),
  addedBy: uuidSchema,
  notes: z.string().max(500, 'Notes must be at most 500 characters').optional(),
  entityType: z.literal('ShoppingListItem'),
  PK: nonEmptyString,
  SK: nonEmptyString,
  GSI2PK: nonEmptyString.optional(),
  GSI2SK: nonEmptyString.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

/**
 * Notification Entity Schema
 */
export const notificationSchema = z.object({
  notificationId: uuidSchema,
  familyId: uuidSchema,
  recipientId: uuidSchema,
  type: notificationTypeSchema,
  status: notificationStatusSchema,
  title: z.string().min(1).max(200, 'Title must be 1-200 characters'),
  message: z.string().min(1).max(1000, 'Message must be 1-1000 characters'),
  relatedItemId: uuidSchema.optional(),
  relatedItemType: entityTypeSchema.optional(),
  entityType: z.literal('Notification'),
  PK: nonEmptyString,
  SK: nonEmptyString,
  GSI1PK: nonEmptyString.optional(),
  GSI1SK: nonEmptyString.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

/**
 * Suggestion Entity Schema
 */
export const suggestionSchema = z.object({
  suggestionId: uuidSchema,
  familyId: uuidSchema,
  suggestedBy: uuidSchema,
  type: suggestionTypeSchema,
  status: suggestionStatusSchema,
  itemName: z.string().min(1).max(200, 'Item name must be 1-200 characters'),
  quantity: z.number().positive('Quantity must be positive').optional(),
  unit: z.string().max(50, 'Unit must be at most 50 characters').optional(),
  locationId: uuidSchema.optional(),
  storeId: uuidSchema.optional(),
  notes: z.string().max(500, 'Notes must be at most 500 characters').optional(),
  reviewedBy: uuidSchema.optional(),
  reviewedAt: isoDateSchema.optional(),
  reviewNotes: z.string().max(500, 'Review notes must be at most 500 characters').optional(),
  entityType: z.literal('Suggestion'),
  PK: nonEmptyString,
  SK: nonEmptyString,
  GSI2PK: nonEmptyString.optional(),
  GSI2SK: nonEmptyString.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

/**
 * API Request Schemas
 */

// Create Family Request
export const createFamilyRequestSchema = z.object({
  name: z.string().min(1).max(100, 'Family name must be 1-100 characters'),
});

// Update Family Request
export const updateFamilyRequestSchema = z.object({
  name: z.string().min(1).max(100, 'Family name must be 1-100 characters'),
});

// Add Member Request
export const addMemberRequestSchema = z.object({
  email: emailSchema,
  name: z.string().min(1).max(100, 'Name must be 1-100 characters'),
  role: memberRoleSchema,
});

// Create InventoryItem Request
export const createInventoryItemRequestSchema = z.object({
  name: z.string().min(1).max(200, 'Item name must be 1-200 characters'),
  quantity: z.number().nonnegative('Quantity cannot be negative'),
  unit: z.string().max(50).optional(),
  locationId: uuidSchema.optional(),
  preferredStoreId: uuidSchema.optional(),
  lowStockThreshold: z.number().nonnegative('Low stock threshold cannot be negative'),
  notes: z.string().max(500).optional(),
});

// Update InventoryItem Request
export const updateInventoryItemRequestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  quantity: z.number().nonnegative().optional(),
  unit: z.string().max(50).optional(),
  locationId: uuidSchema.optional(),
  preferredStoreId: uuidSchema.optional(),
  lowStockThreshold: z.number().nonnegative().optional(),
  notes: z.string().max(500).optional(),
  status: itemStatusSchema.optional(),
});

// Adjust Quantity Request
export const adjustQuantityRequestSchema = z.object({
  adjustment: z.number().int('Adjustment must be an integer'),
});

// Create StorageLocation Request
export const createStorageLocationRequestSchema = z.object({
  name: z.string().min(1).max(100, 'Location name must be 1-100 characters'),
  description: z.string().max(500).optional(),
});

// Update StorageLocation Request
export const updateStorageLocationRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

// Create Store Request
export const createStoreRequestSchema = z.object({
  name: z.string().min(1).max(100, 'Store name must be 1-100 characters'),
  address: z.string().max(500).optional(),
  notes: z.string().max(500).optional(),
});

// Update Store Request
export const updateStoreRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(500).optional(),
});

// Add to Shopping List Request
export const addToShoppingListRequestSchema = z.object({
  inventoryItemId: uuidSchema.optional(),
  itemName: z.string().min(1).max(200, 'Item name must be 1-200 characters'),
  quantity: z.number().positive('Quantity must be positive'),
  unit: z.string().max(50).optional(),
  storeId: uuidSchema.optional(),
  notes: z.string().max(500).optional(),
});

// Update Shopping List Item Request
export const updateShoppingListItemRequestSchema = z.object({
  quantity: z.number().positive().optional(),
  isPurchased: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});

// Acknowledge Notification Request
export const acknowledgeNotificationRequestSchema = z.object({
  // No additional fields required - action sets status to 'read'
});

// Create Suggestion Request
export const createSuggestionRequestSchema = z.object({
  type: suggestionTypeSchema,
  itemName: z.string().min(1).max(200, 'Item name must be 1-200 characters'),
  quantity: z.number().positive().optional(),
  unit: z.string().max(50).optional(),
  locationId: uuidSchema.optional(),
  storeId: uuidSchema.optional(),
  notes: z.string().max(500).optional(),
});

// Review Suggestion Request
export const reviewSuggestionRequestSchema = z.object({
  reviewNotes: z.string().max(500).optional(),
});

/**
 * Type inference helpers
 */
export type CreateFamilyRequest = z.infer<typeof createFamilyRequestSchema>;
export type UpdateFamilyRequest = z.infer<typeof updateFamilyRequestSchema>;
export type AddMemberRequest = z.infer<typeof addMemberRequestSchema>;
export type CreateInventoryItemRequest = z.infer<typeof createInventoryItemRequestSchema>;
export type UpdateInventoryItemRequest = z.infer<typeof updateInventoryItemRequestSchema>;
export type AdjustQuantityRequest = z.infer<typeof adjustQuantityRequestSchema>;
export type CreateStorageLocationRequest = z.infer<typeof createStorageLocationRequestSchema>;
export type UpdateStorageLocationRequest = z.infer<typeof updateStorageLocationRequestSchema>;
export type CreateStoreRequest = z.infer<typeof createStoreRequestSchema>;
export type UpdateStoreRequest = z.infer<typeof updateStoreRequestSchema>;
export type AddToShoppingListRequest = z.infer<typeof addToShoppingListRequestSchema>;
export type UpdateShoppingListItemRequest = z.infer<typeof updateShoppingListItemRequestSchema>;
export type CreateSuggestionRequest = z.infer<typeof createSuggestionRequestSchema>;
export type ReviewSuggestionRequest = z.infer<typeof reviewSuggestionRequestSchema>;
