/**
 * Repository Layer for Reference Data Management
 * Feature: 005-reference-data
 * 
 * Provides DynamoDB operations for StorageLocation and Store entities with:
 * - Case-insensitive uniqueness checking
 * - Optimistic locking support
 * - Reference checking before deletion
 * - Efficient Query operations (no table scans)
 */

import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { docClient, getTableName } from '../dynamodb';
import type {
  StorageLocation,
  CreateStorageLocationRequest,
  UpdateStorageLocationRequest,
  Store,
  CreateStoreRequest,
  UpdateStoreRequest,
} from './schemas';
import {
  ReferenceExistsError,
  VersionConflictError,
  NotFoundError,
} from './errors';

// =============================================================================
// Key Helper Functions
// =============================================================================

/**
 * Build DynamoDB keys for a StorageLocation
 */
export function buildLocationKeys(familyId: string, locationId: string): {
  PK: string;
  SK: string;
} {
  return {
    PK: `FAMILY#${familyId}`,
    SK: `LOCATION#${locationId}`,
  };
}

/**
 * Build DynamoDB keys for a Store
 */
export function buildStoreKeys(familyId: string, storeId: string): {
  PK: string;
  SK: string;
} {
  return {
    PK: `FAMILY#${familyId}`,
    SK: `STORE#${storeId}`,
  };
}

// =============================================================================
// Storage Location Operations
// =============================================================================

/**
 * Create a new storage location
 * Checks for name uniqueness before creating
 */
export async function createStorageLocation(
  familyId: string,
  request: CreateStorageLocationRequest
): Promise<StorageLocation> {
  const tableName = getTableName();
  const locationId = uuidv4();
  const now = new Date().toISOString();
  const nameLower = request.name.toLowerCase();

  const location: StorageLocation = {
    locationId,
    familyId,
    name: request.name,
    nameLower,
    description: request.description ?? null,
    version: 1,
    entityType: 'StorageLocation',
    createdAt: now,
    updatedAt: now,
  };

  const { PK, SK } = buildLocationKeys(familyId, locationId);

  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        ...location,
        PK,
        SK,
      },
    })
  );

  return location;
}

/**
 * List all storage locations for a family
 */
export async function listStorageLocations(
  familyId: string
): Promise<StorageLocation[]> {
  const tableName = getTableName();

  const response = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `FAMILY#${familyId}`,
        ':skPrefix': 'LOCATION#',
      },
    })
  );

  return (response.Items || []) as StorageLocation[];
}

/**
 * Get a specific storage location by ID
 */
export async function getStorageLocation(
  familyId: string,
  locationId: string
): Promise<StorageLocation | null> {
  const tableName = getTableName();
  const { PK, SK } = buildLocationKeys(familyId, locationId);

  const response = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK, SK },
    })
  );

  return response.Item ? (response.Item as StorageLocation) : null;
}

/**
 * Update a storage location with optimistic locking
 */
export async function updateStorageLocation(
  familyId: string,
  locationId: string,
  request: UpdateStorageLocationRequest
): Promise<StorageLocation> {
  const tableName = getTableName();
  const { PK, SK } = buildLocationKeys(familyId, locationId);
  const now = new Date().toISOString();
  const nameLower = request.name.toLowerCase();

  // Get current entity to check version
  const currentLocation = await getStorageLocation(familyId, locationId);
  if (!currentLocation) {
    throw new NotFoundError('StorageLocation', locationId);
  }

  try {
    const response = await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { PK, SK },
        UpdateExpression:
          'SET #name = :name, #nameLower = :nameLower, #description = :description, ' +
          '#version = #version + :one, #updatedAt = :now',
        ConditionExpression: '#version = :expectedVersion',
        ExpressionAttributeNames: {
          '#name': 'name',
          '#nameLower': 'nameLower',
          '#description': 'description',
          '#version': 'version',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':name': request.name,
          ':nameLower': nameLower,
          ':description': request.description ?? null,
          ':one': 1,
          ':expectedVersion': request.version,
          ':now': now,
        },
        ReturnValues: 'ALL_NEW',
      })
    );

    return response.Attributes as StorageLocation;
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      // Re-fetch current entity for conflict resolution
      const current = await getStorageLocation(familyId, locationId);
      throw new VersionConflictError(
        'StorageLocation',
        locationId,
        request.version,
        current?.version || 0,
        current
      );
    }
    throw error;
  }
}

/**
 * Delete a storage location
 * Checks for references before deleting
 */
export async function deleteStorageLocation(
  familyId: string,
  locationId: string
): Promise<void> {
  const tableName = getTableName();
  const { PK, SK } = buildLocationKeys(familyId, locationId);

  // Check if location exists
  const location = await getStorageLocation(familyId, locationId);
  if (!location) {
    throw new NotFoundError('StorageLocation', locationId);
  }

  // Check for references
  const hasReferences = await hasLocationReferences(familyId, locationId);
  if (hasReferences) {
    const referenceCount = await getLocationReferenceCount(familyId, locationId);
    throw new ReferenceExistsError('StorageLocation', locationId, {
      inventoryItems: referenceCount,
    });
  }

  await docClient.send(
    new DeleteCommand({
      TableName: tableName,
      Key: { PK, SK },
    })
  );
}

/**
 * Check if a storage location name exists (case-insensitive)
 */
export async function checkStorageLocationNameExists(
  familyId: string,
  nameLower: string
): Promise<boolean> {
  const tableName = getTableName();

  const response = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      FilterExpression: '#nameLower = :nameLower',
      ExpressionAttributeNames: {
        '#nameLower': 'nameLower',
      },
      ExpressionAttributeValues: {
        ':pk': `FAMILY#${familyId}`,
        ':skPrefix': 'LOCATION#',
        ':nameLower': nameLower,
      },
      Limit: 1,
      Select: 'COUNT',
    })
  );

  return (response.Count || 0) > 0;
}

/**
 * Check if a storage location has references from inventory items
 */
export async function hasLocationReferences(
  familyId: string,
  locationId: string
): Promise<boolean> {
  const tableName = getTableName();

  const response = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      FilterExpression: '#locationId = :locationId',
      ExpressionAttributeNames: {
        '#locationId': 'locationId',
      },
      ExpressionAttributeValues: {
        ':pk': `FAMILY#${familyId}`,
        ':skPrefix': 'ITEM#',
        ':locationId': locationId,
      },
      Limit: 1,
      Select: 'COUNT',
    })
  );

  return (response.Count || 0) > 0;
}

/**
 * Get count of inventory items referencing a storage location
 */
export async function getLocationReferenceCount(
  familyId: string,
  locationId: string
): Promise<number> {
  const tableName = getTableName();

  const response = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      FilterExpression: '#locationId = :locationId',
      ExpressionAttributeNames: {
        '#locationId': 'locationId',
      },
      ExpressionAttributeValues: {
        ':pk': `FAMILY#${familyId}`,
        ':skPrefix': 'ITEM#',
        ':locationId': locationId,
      },
      Select: 'COUNT',
    })
  );

  return response.Count || 0;
}

// =============================================================================
// Store Operations
// =============================================================================

/**
 * Create a new store
 * Checks for name uniqueness before creating
 */
export async function createStore(
  familyId: string,
  request: CreateStoreRequest
): Promise<Store> {
  const tableName = getTableName();
  const storeId = uuidv4();
  const now = new Date().toISOString();
  const nameLower = request.name.toLowerCase();

  const store: Store = {
    storeId,
    familyId,
    name: request.name,
    nameLower,
    address: request.address ?? null,
    version: 1,
    entityType: 'Store',
    createdAt: now,
    updatedAt: now,
  };

  const { PK, SK } = buildStoreKeys(familyId, storeId);

  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        ...store,
        PK,
        SK,
      },
    })
  );

  return store;
}

/**
 * List all stores for a family
 */
export async function listStores(familyId: string): Promise<Store[]> {
  const tableName = getTableName();

  const response = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `FAMILY#${familyId}`,
        ':skPrefix': 'STORE#',
      },
    })
  );

  return (response.Items || []) as Store[];
}

/**
 * Get a specific store by ID
 */
export async function getStore(
  familyId: string,
  storeId: string
): Promise<Store | null> {
  const tableName = getTableName();
  const { PK, SK } = buildStoreKeys(familyId, storeId);

  const response = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK, SK },
    })
  );

  return response.Item ? (response.Item as Store) : null;
}

/**
 * Update a store with optimistic locking
 */
export async function updateStore(
  familyId: string,
  storeId: string,
  request: UpdateStoreRequest
): Promise<Store> {
  const tableName = getTableName();
  const { PK, SK } = buildStoreKeys(familyId, storeId);
  const now = new Date().toISOString();
  const nameLower = request.name.toLowerCase();

  // Get current entity to check version
  const currentStore = await getStore(familyId, storeId);
  if (!currentStore) {
    throw new NotFoundError('Store', storeId);
  }

  try {
    const response = await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { PK, SK },
        UpdateExpression:
          'SET #name = :name, #nameLower = :nameLower, #address = :address, ' +
          '#version = #version + :one, #updatedAt = :now',
        ConditionExpression: '#version = :expectedVersion',
        ExpressionAttributeNames: {
          '#name': 'name',
          '#nameLower': 'nameLower',
          '#address': 'address',
          '#version': 'version',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':name': request.name,
          ':nameLower': nameLower,
          ':address': request.address ?? null,
          ':one': 1,
          ':expectedVersion': request.version,
          ':now': now,
        },
        ReturnValues: 'ALL_NEW',
      })
    );

    return response.Attributes as Store;
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      // Re-fetch current entity for conflict resolution
      const current = await getStore(familyId, storeId);
      throw new VersionConflictError(
        'Store',
        storeId,
        request.version,
        current?.version || 0,
        current
      );
    }
    throw error;
  }
}

/**
 * Delete a store
 * Checks for references before deleting (both InventoryItems and ShoppingListItems)
 */
export async function deleteStore(
  familyId: string,
  storeId: string
): Promise<void> {
  const tableName = getTableName();
  const { PK, SK } = buildStoreKeys(familyId, storeId);

  // Check if store exists
  const store = await getStore(familyId, storeId);
  if (!store) {
    throw new NotFoundError('Store', storeId);
  }

  // Check for references
  const hasReferences = await hasStoreReferences(familyId, storeId);
  if (hasReferences) {
    const referenceCount = await getStoreReferenceCount(familyId, storeId);
    throw new ReferenceExistsError('Store', storeId, referenceCount);
  }

  await docClient.send(
    new DeleteCommand({
      TableName: tableName,
      Key: { PK, SK },
    })
  );
}

/**
 * Check if a store name exists (case-insensitive)
 */
export async function checkStoreNameExists(
  familyId: string,
  nameLower: string
): Promise<boolean> {
  const tableName = getTableName();

  const response = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      FilterExpression: '#nameLower = :nameLower',
      ExpressionAttributeNames: {
        '#nameLower': 'nameLower',
      },
      ExpressionAttributeValues: {
        ':pk': `FAMILY#${familyId}`,
        ':skPrefix': 'STORE#',
        ':nameLower': nameLower,
      },
      Limit: 1,
      Select: 'COUNT',
    })
  );

  return (response.Count || 0) > 0;
}

/**
 * Check if a store has references from inventory items or shopping list items
 */
export async function hasStoreReferences(
  familyId: string,
  storeId: string
): Promise<boolean> {
  const tableName = getTableName();

  // Check inventory items
  const inventoryResponse = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      FilterExpression: '#storeId = :storeId',
      ExpressionAttributeNames: {
        '#storeId': 'storeId',
      },
      ExpressionAttributeValues: {
        ':pk': `FAMILY#${familyId}`,
        ':skPrefix': 'ITEM#',
        ':storeId': storeId,
      },
      Limit: 1,
      Select: 'COUNT',
    })
  );

  if ((inventoryResponse.Count || 0) > 0) {
    return true;
  }

  // Check shopping list items
  const shoppingListResponse = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      FilterExpression: '#storeId = :storeId',
      ExpressionAttributeNames: {
        '#storeId': 'storeId',
      },
      ExpressionAttributeValues: {
        ':pk': `FAMILY#${familyId}`,
        ':skPrefix': 'SHOPPINGLISTITEM#',
        ':storeId': storeId,
      },
      Limit: 1,
      Select: 'COUNT',
    })
  );

  return (shoppingListResponse.Count || 0) > 0;
}

/**
 * Get count of items referencing a store (both inventory and shopping list)
 */
export async function getStoreReferenceCount(
  familyId: string,
  storeId: string
): Promise<{ inventoryItems?: number; shoppingListItems?: number }> {
  const tableName = getTableName();
  const references: { inventoryItems?: number; shoppingListItems?: number } = {};

  // Count inventory items
  const inventoryResponse = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      FilterExpression: '#storeId = :storeId',
      ExpressionAttributeNames: {
        '#storeId': 'storeId',
      },
      ExpressionAttributeValues: {
        ':pk': `FAMILY#${familyId}`,
        ':skPrefix': 'ITEM#',
        ':storeId': storeId,
      },
      Select: 'COUNT',
    })
  );

  const inventoryCount = inventoryResponse.Count || 0;
  if (inventoryCount > 0) {
    references.inventoryItems = inventoryCount;
  }

  // Count shopping list items
  const shoppingListResponse = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      FilterExpression: '#storeId = :storeId',
      ExpressionAttributeNames: {
        '#storeId': 'storeId',
      },
      ExpressionAttributeValues: {
        ':pk': `FAMILY#${familyId}`,
        ':skPrefix': 'SHOPPINGLISTITEM#',
        ':storeId': storeId,
      },
      Select: 'COUNT',
    })
  );

  const shoppingListCount = shoppingListResponse.Count || 0;
  if (shoppingListCount > 0) {
    references.shoppingListItems = shoppingListCount;
  }

  return references;
}
