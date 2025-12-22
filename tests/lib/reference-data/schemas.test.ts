/**
 * Unit Tests for Reference Data Validation Schemas
 * Feature: 005-reference-data
 */

import {
  StorageLocationNameSchema,
  StorageLocationDescriptionSchema,
  StorageLocationSchema,
  CreateStorageLocationSchema,
  UpdateStorageLocationSchema,
  StoreNameSchema,
  StoreAddressSchema,
  StoreSchema,
  CreateStoreSchema,
  UpdateStoreSchema,
  CheckNameRequestSchema,
} from '../../../src/lib/reference-data/schemas';

describe('StorageLocation Schemas', () => {
  describe('StorageLocationNameSchema', () => {
    it('should accept valid names', () => {
      expect(StorageLocationNameSchema.parse('Pantry')).toBe('Pantry');
      expect(StorageLocationNameSchema.parse('Kitchen Cabinet')).toBe('Kitchen Cabinet');
      expect(StorageLocationNameSchema.parse('a')).toBe('a'); // Min length
      expect(StorageLocationNameSchema.parse('a'.repeat(50))).toHaveLength(50); // Max length
    });

    it('should trim whitespace', () => {
      expect(StorageLocationNameSchema.parse('  Pantry  ')).toBe('Pantry');
      expect(StorageLocationNameSchema.parse('\tKitchen\t')).toBe('Kitchen');
    });

    it('should reject empty or too long names', () => {
      expect(() => StorageLocationNameSchema.parse('')).toThrow();
      expect(() => StorageLocationNameSchema.parse('   ')).toThrow();
      expect(() => StorageLocationNameSchema.parse('a'.repeat(51))).toThrow();
    });
  });

  describe('StorageLocationDescriptionSchema', () => {
    it('should accept valid descriptions', () => {
      expect(StorageLocationDescriptionSchema.parse('Main pantry')).toBe('Main pantry');
      expect(StorageLocationDescriptionSchema.parse(null)).toBeNull();
      expect(StorageLocationDescriptionSchema.parse(undefined)).toBeUndefined();
    });

    it('should trim whitespace', () => {
      expect(StorageLocationDescriptionSchema.parse('  Description  ')).toBe('Description');
    });

    it('should convert empty string to null', () => {
      expect(StorageLocationDescriptionSchema.parse('')).toBeNull();
      expect(StorageLocationDescriptionSchema.parse('   ')).toBeNull();
    });

    it('should reject too long descriptions', () => {
      expect(() => StorageLocationDescriptionSchema.parse('a'.repeat(201))).toThrow();
    });
  });

  describe('StorageLocationSchema', () => {
    it('should validate complete storage location', () => {
      const location = {
        locationId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        familyId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        name: 'Pantry',
        nameLower: 'pantry',
        description: 'Main pantry cabinet',
        version: 1,
        entityType: 'StorageLocation' as const,
        createdAt: '2025-12-10T10:00:00Z',
        updatedAt: '2025-12-10T10:00:00Z',
      };

      const result = StorageLocationSchema.parse(location);
      expect(result).toEqual(location);
    });

    it('should reject invalid UUIDs', () => {
      const location = {
        locationId: 'invalid-uuid',
        familyId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        name: 'Pantry',
        nameLower: 'pantry',
        description: null,
        version: 1,
        entityType: 'StorageLocation' as const,
        createdAt: '2025-12-10T10:00:00Z',
        updatedAt: '2025-12-10T10:00:00Z',
      };

      expect(() => StorageLocationSchema.parse(location)).toThrow();
    });

    it('should reject invalid version', () => {
      const location = {
        locationId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        familyId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        name: 'Pantry',
        nameLower: 'pantry',
        description: null,
        version: 0, // Invalid - must be positive
        entityType: 'StorageLocation' as const,
        createdAt: '2025-12-10T10:00:00Z',
        updatedAt: '2025-12-10T10:00:00Z',
      };

      expect(() => StorageLocationSchema.parse(location)).toThrow();
    });
  });

  describe('CreateStorageLocationSchema', () => {
    it('should validate create request', () => {
      const request = {
        name: 'Pantry',
        description: 'Main pantry cabinet',
      };

      const result = CreateStorageLocationSchema.parse(request);
      expect(result.name).toBe('Pantry');
      expect(result.description).toBe('Main pantry cabinet');
    });

    it('should accept null description', () => {
      const request = {
        name: 'Pantry',
        description: null,
      };

      const result = CreateStorageLocationSchema.parse(request);
      expect(result.description).toBeNull();
    });
  });

  describe('UpdateStorageLocationSchema', () => {
    it('should validate update request with version', () => {
      const request = {
        name: 'Updated Pantry',
        description: 'Updated description',
        version: 1,
      };

      const result = UpdateStorageLocationSchema.parse(request);
      expect(result.version).toBe(1);
    });

    it('should require version field', () => {
      const request = {
        name: 'Pantry',
        description: 'Description',
      };

      expect(() => UpdateStorageLocationSchema.parse(request)).toThrow();
    });
  });
});

describe('Store Schemas', () => {
  describe('StoreNameSchema', () => {
    it('should accept valid store names', () => {
      expect(StoreNameSchema.parse('Costco')).toBe('Costco');
      expect(StoreNameSchema.parse('Whole Foods Market')).toBe('Whole Foods Market');
      expect(StoreNameSchema.parse('a')).toBe('a'); // Min length
      expect(StoreNameSchema.parse('a'.repeat(100))).toHaveLength(100); // Max length
    });

    it('should trim whitespace', () => {
      expect(StoreNameSchema.parse('  Costco  ')).toBe('Costco');
    });

    it('should reject empty or too long names', () => {
      expect(() => StoreNameSchema.parse('')).toThrow();
      expect(() => StoreNameSchema.parse('a'.repeat(101))).toThrow();
    });
  });

  describe('StoreAddressSchema', () => {
    it('should accept valid addresses', () => {
      expect(StoreAddressSchema.parse('123 Main St')).toBe('123 Main St');
      expect(StoreAddressSchema.parse(null)).toBeNull();
    });

    it('should trim whitespace', () => {
      expect(StoreAddressSchema.parse('  123 Main St  ')).toBe('123 Main St');
    });

    it('should convert empty string to null', () => {
      expect(StoreAddressSchema.parse('')).toBeNull();
    });

    it('should reject too long addresses', () => {
      expect(() => StoreAddressSchema.parse('a'.repeat(201))).toThrow();
    });
  });

  describe('StoreSchema', () => {
    it('should validate complete store', () => {
      const store = {
        storeId: '9d3e8679-8425-50de-944b-e08fc2f90bf8',
        familyId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        name: 'Costco',
        nameLower: 'costco',
        address: '123 Main St',
        version: 1,
        entityType: 'Store' as const,
        createdAt: '2025-12-10T10:00:00Z',
        updatedAt: '2025-12-10T10:00:00Z',
      };

      const result = StoreSchema.parse(store);
      expect(result).toEqual(store);
    });
  });

  describe('CreateStoreSchema', () => {
    it('should validate create request', () => {
      const request = {
        name: 'Costco',
        address: '123 Main St',
      };

      const result = CreateStoreSchema.parse(request);
      expect(result.name).toBe('Costco');
      expect(result.address).toBe('123 Main St');
    });
  });

  describe('UpdateStoreSchema', () => {
    it('should validate update request with version', () => {
      const request = {
        name: 'Updated Costco',
        address: 'Updated address',
        version: 2,
      };

      const result = UpdateStoreSchema.parse(request);
      expect(result.version).toBe(2);
    });
  });
});

describe('CheckNameRequestSchema', () => {
  it('should validate name check request', () => {
    const request = {
      name: 'Pantry',
    };

    const result = CheckNameRequestSchema.parse(request);
    expect(result.name).toBe('Pantry');
  });

  it('should trim name', () => {
    const request = {
      name: '  Pantry  ',
    };

    const result = CheckNameRequestSchema.parse(request);
    expect(result.name).toBe('Pantry');
  });

  it('should accept optional excludeId', () => {
    const request = {
      name: 'Pantry',
      excludeId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    };

    const result = CheckNameRequestSchema.parse(request);
    expect(result.excludeId).toBe('7c9e6679-7425-40de-944b-e07fc1f90ae7');
  });

  it('should reject empty name', () => {
    expect(() => CheckNameRequestSchema.parse({ name: '' })).toThrow();
  });
});
