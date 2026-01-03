/**
 * Zod validation schemas for Reference Data Management
 * Feature: 005-reference-data
 * 
 * Provides validation for StorageLocation and Store entities with:
 * - Whitespace trimming
 * - Length constraints
 * - Optimistic locking support (version field)
 * - Case-insensitive uniqueness checking (nameLower field)
 */

import { z } from 'zod';

// =============================================================================
// Storage Location Schemas
// =============================================================================

/**
 * Storage location name validation
 * - Trims whitespace
 * - Requires 1-50 characters after trimming
 */
export const StorageLocationNameSchema = z
  .string()
  .trim()
  .min(1, 'Storage location name is required')
  .max(50, 'Storage location name must be 50 characters or less');

/**
 * Storage location description validation
 * - Trims whitespace
 * - Optional (nullable)
 * - 0-200 characters after trimming
 */
export const StorageLocationDescriptionSchema = z
  .string()
  .trim()
  .max(200, 'Description must be 200 characters or less')
  .nullable()
  .optional()
  .transform((val) => val === '' ? null : val);

/**
 * Full StorageLocation entity schema
 */
export const StorageLocationSchema = z.object({
  locationId: z.string().uuid(),
  familyId: z.string().uuid(),
  name: StorageLocationNameSchema,
  nameLower: z.string(), // Lowercase version for uniqueness checks
  description: StorageLocationDescriptionSchema,
  archived: z.boolean().optional(),
  version: z.number().int().positive(),
  entityType: z.literal('StorageLocation'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * Schema for creating a new storage location
 */
export const CreateStorageLocationSchema = z.object({
  name: StorageLocationNameSchema,
  description: StorageLocationDescriptionSchema,
});

/**
 * Schema for updating an existing storage location
 * Requires version for optimistic locking
 */
export const UpdateStorageLocationSchema = z.object({
  name: StorageLocationNameSchema,
  description: StorageLocationDescriptionSchema,
  version: z.number().int().positive(),
});

// =============================================================================
// Store Schemas
// =============================================================================

/**
 * Store name validation
 * - Trims whitespace
 * - Requires 1-100 characters after trimming
 */
export const StoreNameSchema = z
  .string()
  .trim()
  .min(1, 'Store name is required')
  .max(100, 'Store name must be 100 characters or less');

/**
 * Store address validation
 * - Trims whitespace
 * - Optional (nullable)
 * - 0-200 characters after trimming
 */
export const StoreAddressSchema = z
  .string()
  .trim()
  .max(200, 'Address must be 200 characters or less')
  .nullable()
  .optional()
  .transform((val) => val === '' ? null : val);

/**
 * Full Store entity schema
 */
export const StoreSchema = z.object({
  storeId: z.string().uuid(),
  familyId: z.string().uuid(),
  name: StoreNameSchema,
  nameLower: z.string(), // Lowercase version for uniqueness checks
  address: StoreAddressSchema,
  archived: z.boolean().optional(),
  version: z.number().int().positive(),
  entityType: z.literal('Store'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * Schema for creating a new store
 */
export const CreateStoreSchema = z.object({
  name: StoreNameSchema,
  address: StoreAddressSchema,
});

/**
 * Schema for updating an existing store
 * Requires version for optimistic locking
 */
export const UpdateStoreSchema = z.object({
  name: StoreNameSchema,
  address: StoreAddressSchema,
  version: z.number().int().positive(),
});

// =============================================================================
// Utility Schemas
// =============================================================================

/**
 * Schema for name availability check requests
 */
export const CheckNameRequestSchema = z.object({
  name: z.string().trim().min(1),
  excludeId: z.string().uuid().optional(), // Exclude during edit operations
});

// =============================================================================
// TypeScript Types
// =============================================================================

export type StorageLocation = z.infer<typeof StorageLocationSchema>;
export type CreateStorageLocationRequest = z.infer<typeof CreateStorageLocationSchema>;
export type UpdateStorageLocationRequest = z.infer<typeof UpdateStorageLocationSchema>;

export type Store = z.infer<typeof StoreSchema>;
export type CreateStoreRequest = z.infer<typeof CreateStoreSchema>;
export type UpdateStoreRequest = z.infer<typeof UpdateStoreSchema>;

export type CheckNameRequest = z.infer<typeof CheckNameRequestSchema>;
