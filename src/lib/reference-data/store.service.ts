/**
 * Service Layer for Store Management
 * Feature: 005-reference-data / User Story 6
 * 
 * Provides business logic for store CRUD operations with:
 * - Role-based access control (adults only for mutations)
 * - Case-insensitive uniqueness enforcement
 * - Optimistic locking for concurrent edits
 * - Reference checking before deletion (both inventory and shopping list items)
 */

import type {
  Store,
  CreateStoreRequest,
  UpdateStoreRequest,
} from './schemas';
import {
  createStore as createStoreRepo,
  listStores as listStoresRepo,
  getStore as getStoreRepo,
  updateStore as updateStoreRepo,
  deleteStore as deleteStoreRepo,
  checkStoreNameExists,
} from './repository';
import { logger } from '../logger';
import type { UserContext } from '../auth';

/**
 * Name availability check result
 */
export interface NameAvailabilityResult {
  available: boolean;
  name: string;
}

/**
 * Create a new store
 * Note: Admin role validation handled by requireAdmin() in handler
 */
export async function createStore(
  familyId: string,
  context: UserContext,
  request: CreateStoreRequest
): Promise<Store> {
  logger.info('Creating store', {
    familyId: familyId,
    memberId: context.memberId,
    name: request.name,
  });

  const store = await createStoreRepo(familyId, request);
  
  logger.info('Store created', {
    familyId: familyId,
    storeId: store.storeId,
    name: store.name,
  });
  
  return store;
}

/**
 * List all stores for the family
 * Available to all family members
 */
export async function listStores(familyId: string, context: UserContext): Promise<Store[]> {
  logger.debug('Listing stores', {
    familyId: familyId,
    memberId: context.memberId,
  });
  
  const stores = await listStoresRepo(familyId);
  
  logger.debug('Stores retrieved', {
    familyId: familyId,
    count: stores.length,
  });
  
  return stores;
}

/**
 * Get a specific store by ID
 * Available to all family members
 */
export async function getStore(
  familyId: string,
  context: UserContext,
  storeId: string
): Promise<Store | null> {
  logger.debug('Getting store', {
    familyId: familyId,
    memberId: context.memberId,
    storeId,
  });
  
  const store = await getStoreRepo(familyId, storeId);
  
  if (store) {
    logger.debug('Store retrieved', {
      familyId: familyId,
      storeId: store.storeId,
      name: store.name,
    });
  } else {
    logger.debug('Store not found', {
      familyId: familyId,
      storeId,
    });
  }
  
  return store;
}

/**
 * Update an existing store
 * Requires admin role (enforced by handler via requireAdmin())
 */
export async function updateStore(
  familyId: string,
  context: UserContext,
  storeId: string,
  request: UpdateStoreRequest
): Promise<Store> {
  logger.info('Updating store', {
    familyId: familyId,
    memberId: context.memberId,
    storeId,
    version: request.version,
  });

  const store = await updateStoreRepo(familyId, storeId, request);
  
  logger.info('Store updated', {
    familyId: familyId,
    storeId: store.storeId,
    name: store.name,
    version: store.version,
  });
  
  return store;
}

/**
 * Delete a store
 * Requires admin role (enforced by handler via requireAdmin())
 * Checks for references before deleting (both inventory and shopping list items)
 */
export async function deleteStore(
  familyId: string,
  context: UserContext,
  storeId: string
): Promise<void> {
  logger.info('Deleting store', {
    familyId: familyId,
    memberId: context.memberId,
    storeId,
  });

  await deleteStoreRepo(familyId, storeId);
  
  logger.info('Store deleted', {
    familyId: familyId,
    storeId,
  });
}

/**
 * Check if a store name is available (case-insensitive)
 * Used for real-time validation during data entry
 * Available to all family members
 */
export async function checkStoreName(
  familyId: string,
  name: string
): Promise<NameAvailabilityResult> {
  logger.debug('Checking store name availability', {
    familyId: familyId,
    name: name.trim(),
  });
  
  const nameLower = name.trim().toLowerCase();
  const exists = await checkStoreNameExists(familyId, nameLower);

  logger.debug('Store name check complete', {
    familyId: familyId,
    name: name.trim(),
    available: !exists,
  });

  return {
    available: !exists,
    name: name.trim(),
  };
}
