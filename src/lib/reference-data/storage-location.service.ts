/**
 * Service Layer for Storage Location Management
 * Feature: 005-reference-data / User Story 6
 * 
 * Provides business logic for storage location CRUD operations with:
 * - Role-based access control (adults only for mutations)
 * - Case-insensitive uniqueness enforcement
 * - Optimistic locking for concurrent edits
 * - Reference checking before deletion
 */

import type {
  StorageLocation,
  CreateStorageLocationRequest,
  UpdateStorageLocationRequest,
} from './schemas';
import {
  createStorageLocation as createStorageLocationRepo,
  listStorageLocations as listStorageLocationsRepo,
  getStorageLocation as getStorageLocationRepo,
  updateStorageLocation as updateStorageLocationRepo,
  deleteStorageLocation as deleteStorageLocationRepo,
  checkStorageLocationNameExists,
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
 * Create a new storage location
 * Note: Admin role validation handled by requireAdmin() in handler
 */
export async function createStorageLocation(
  familyId: string,
  context: UserContext,
  request: CreateStorageLocationRequest
): Promise<StorageLocation> {
  logger.info('Creating storage location', {
    familyId: familyId,
    memberId: context.memberId,
    name: request.name,
  });

  const location = await createStorageLocationRepo(familyId, request);
  
  logger.info('Storage location created', {
    familyId: familyId,
    locationId: location.locationId,
    name: location.name,
  });
  
  return location;
}

/**
 * List all storage locations for the family
 * Available to all family members
 */
export async function listStorageLocations(
  familyId: string,
  context: UserContext
): Promise<StorageLocation[]> {
  logger.debug('Listing storage locations', {
    familyId: familyId,
    memberId: context.memberId,
  });
  
  const locations = await listStorageLocationsRepo(familyId);
  
  logger.debug('Storage locations retrieved', {
    familyId: familyId,
    count: locations.length,
  });
  
  return locations;
}

/**
 * Get a specific storage location by ID
 * Available to all family members
 */
export async function getStorageLocation(
  familyId: string,
  context: UserContext,
  locationId: string
): Promise<StorageLocation | null> {
  logger.debug('Getting storage location', {
    familyId: familyId,
    memberId: context.memberId,
    locationId,
  });
  
  const location = await getStorageLocationRepo(familyId, locationId);
  
  if (location) {
    logger.debug('Storage location retrieved', {
      familyId: familyId,
      locationId: location.locationId,
      name: location.name,
    });
  } else {
    logger.debug('Storage location not found', {
      familyId: familyId,
      locationId,
    });
  }
  
  return location;
}

/**
 * Update an existing storage location
 * Requires admin role (enforced by handler via requireAdmin())
 */
export async function updateStorageLocation(
  familyId: string,
  context: UserContext,
  locationId: string,
  request: UpdateStorageLocationRequest
): Promise<StorageLocation> {
  logger.info('Updating storage location', {
    familyId: familyId,
    memberId: context.memberId,
    locationId,
    version: request.version,
  });

  const location = await updateStorageLocationRepo(familyId, locationId, request);
  
  logger.info('Storage location updated', {
    familyId: familyId,
    locationId: location.locationId,
    name: location.name,
    version: location.version,
  });
  
  return location;
}

/**
 * Delete a storage location
 * Requires admin role (enforced by handler via requireAdmin())
 * Checks for references before deleting
 */
export async function deleteStorageLocation(
  familyId: string,
  context: UserContext,
  locationId: string
): Promise<void> {
  logger.info('Deleting storage location', {
    familyId: familyId,
    memberId: context.memberId,
    locationId,
  });

  await deleteStorageLocationRepo(familyId, locationId);
  
  logger.info('Storage location deleted', {
    familyId: familyId,
    locationId,
  });
}

/**
 * Check if a storage location name is available (case-insensitive)
 * Used for real-time validation during data entry
 * Available to all family members
 */
export async function checkStorageLocationName(
  familyId: string,
  name: string
): Promise<NameAvailabilityResult> {
  logger.debug('Checking storage location name availability', {
    familyId: familyId,
    name: name.trim(),
  });
  
  const nameLower = name.trim().toLowerCase();
  const exists = await checkStorageLocationNameExists(familyId, nameLower);

  logger.debug('Storage location name check complete', {
    familyId: familyId,
    name: name.trim(),
    available: !exists,
  });

  return {
    available: !exists,
    name: name.trim(),
  };
}
