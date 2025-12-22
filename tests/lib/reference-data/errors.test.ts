/**
 * Unit Tests for Reference Data Custom Errors
 * Feature: 005-reference-data
 */

import {
  DuplicateNameError,
  ReferenceExistsError,
  VersionConflictError,
  NotFoundError,
} from '../../../src/lib/reference-data/errors';

describe('DuplicateNameError', () => {
  it('should create error with correct properties', () => {
    const error = new DuplicateNameError('StorageLocation', 'Pantry');

    expect(error.name).toBe('DuplicateNameError');
    expect(error.code).toBe('DUPLICATE_NAME');
    expect(error.statusCode).toBe(409);
    expect(error.entityType).toBe('StorageLocation');
    expect(error.message).toContain('Pantry');
    expect(error.message).toContain('StorageLocation');
  });

  it('should serialize to JSON correctly', () => {
    const error = new DuplicateNameError('Store', 'Costco');
    const json = error.toJSON();

    expect(json).toEqual({
      error: 'DUPLICATE_NAME',
      message: expect.stringContaining('Costco'),
      entityType: 'Store',
      name: 'DuplicateNameError',
    });
  });

  it('should be instanceof Error', () => {
    const error = new DuplicateNameError('StorageLocation', 'Pantry');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DuplicateNameError);
  });
});

describe('ReferenceExistsError', () => {
  it('should create error with inventory item references', () => {
    const error = new ReferenceExistsError('StorageLocation', 'loc-123', {
      inventoryItems: 5,
    });

    expect(error.name).toBe('ReferenceExistsError');
    expect(error.code).toBe('REFERENCE_EXISTS');
    expect(error.statusCode).toBe(409);
    expect(error.entityType).toBe('StorageLocation');
    expect(error.entityId).toBe('loc-123');
    expect(error.references).toEqual({ inventoryItems: 5 });
    expect(error.message).toContain('5 inventoryItems');
  });

  it('should create error with multiple reference types', () => {
    const error = new ReferenceExistsError('Store', 'store-456', {
      inventoryItems: 3,
      shoppingListItems: 7,
    });

    expect(error.references).toEqual({
      inventoryItems: 3,
      shoppingListItems: 7,
    });
    expect(error.message).toContain('3 inventoryItems');
    expect(error.message).toContain('7 shoppingListItems');
  });

  it('should serialize to JSON correctly', () => {
    const error = new ReferenceExistsError('StorageLocation', 'loc-123', {
      inventoryItems: 5,
    });
    const json = error.toJSON();

    expect(json).toEqual({
      error: 'REFERENCE_EXISTS',
      message: expect.any(String),
      entityType: 'StorageLocation',
      entityId: 'loc-123',
      references: { inventoryItems: 5 },
    });
  });

  it('should be instanceof Error', () => {
    const error = new ReferenceExistsError('Store', 'store-123', {
      inventoryItems: 1,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ReferenceExistsError);
  });
});

describe('VersionConflictError', () => {
  it('should create error with correct properties', () => {
    const currentEntity = {
      locationId: 'loc-123',
      name: 'Updated Name',
      version: 2,
    };

    const error = new VersionConflictError(
      'StorageLocation',
      'loc-123',
      1, // expected version
      2, // current version
      currentEntity
    );

    expect(error.name).toBe('VersionConflictError');
    expect(error.code).toBe('VERSION_CONFLICT');
    expect(error.statusCode).toBe(409);
    expect(error.entityType).toBe('StorageLocation');
    expect(error.entityId).toBe('loc-123');
    expect(error.expectedVersion).toBe(1);
    expect(error.currentVersion).toBe(2);
    expect(error.currentEntity).toEqual(currentEntity);
    expect(error.message).toContain('expected version 1');
    expect(error.message).toContain('current version is 2');
  });

  it('should serialize to JSON correctly', () => {
    const currentEntity = {
      storeId: 'store-456',
      name: 'Current Name',
      version: 3,
    };

    const error = new VersionConflictError(
      'Store',
      'store-456',
      2,
      3,
      currentEntity
    );
    const json = error.toJSON();

    expect(json).toEqual({
      error: 'VERSION_CONFLICT',
      message: expect.any(String),
      entityType: 'Store',
      entityId: 'store-456',
      expectedVersion: 2,
      currentVersion: 3,
      currentEntity,
    });
  });

  it('should be instanceof Error', () => {
    const error = new VersionConflictError('StorageLocation', 'loc-123', 1, 2, {});
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(VersionConflictError);
  });
});

describe('NotFoundError', () => {
  it('should create error with correct properties for StorageLocation', () => {
    const error = new NotFoundError('StorageLocation', 'loc-123');

    expect(error.name).toBe('NotFoundError');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.statusCode).toBe(404);
    expect(error.entityType).toBe('StorageLocation');
    expect(error.entityId).toBe('loc-123');
    expect(error.message).toContain('StorageLocation');
    expect(error.message).toContain('loc-123');
    expect(error.message).toContain('not found');
  });

  it('should create error with correct properties for Store', () => {
    const error = new NotFoundError('Store', 'store-456');

    expect(error.entityType).toBe('Store');
    expect(error.entityId).toBe('store-456');
    expect(error.message).toContain('Store');
    expect(error.message).toContain('store-456');
  });

  it('should serialize to JSON correctly', () => {
    const error = new NotFoundError('StorageLocation', 'loc-123');
    const json = error.toJSON();

    expect(json).toEqual({
      error: 'NOT_FOUND',
      message: expect.any(String),
      entityType: 'StorageLocation',
      entityId: 'loc-123',
    });
  });

  it('should be instanceof Error', () => {
    const error = new NotFoundError('Store', 'store-123');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(NotFoundError);
  });
});
