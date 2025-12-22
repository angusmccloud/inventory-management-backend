/**
 * Unit Tests for Reference Data Repository Layer
 * Feature: 005-reference-data
 * 
 * Note: These tests focus on key generation and error handling logic.
 * Full integration tests with DynamoDB mocks would be extensive - those
 * are better covered in integration tests where we can use actual DynamoDB Local.
 */

import {
  buildLocationKeys,
  buildStoreKeys,
} from '../../../src/lib/reference-data/repository';

describe('Repository Key Helper Functions', () => {
  describe('buildLocationKeys', () => {
    it('should generate correct keys for storage location', () => {
      const familyId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      const locationId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

      const keys = buildLocationKeys(familyId, locationId);

      expect(keys).toEqual({
        PK: `FAMILY#${familyId}`,
        SK: `LOCATION#${locationId}`,
      });
    });

    it('should handle different UUIDs correctly', () => {
      const keys1 = buildLocationKeys('family-1', 'location-1');
      const keys2 = buildLocationKeys('family-2', 'location-2');

      expect(keys1.PK).not.toBe(keys2.PK);
      expect(keys1.SK).not.toBe(keys2.SK);
    });
  });

  describe('buildStoreKeys', () => {
    it('should generate correct keys for store', () => {
      const familyId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      const storeId = '9d3e8679-8425-50de-944b-e08fc2f90bf8';

      const keys = buildStoreKeys(familyId, storeId);

      expect(keys).toEqual({
        PK: `FAMILY#${familyId}`,
        SK: `STORE#${storeId}`,
      });
    });

    it('should handle different UUIDs correctly', () => {
      const keys1 = buildStoreKeys('family-1', 'store-1');
      const keys2 = buildStoreKeys('family-2', 'store-2');

      expect(keys1.PK).not.toBe(keys2.PK);
      expect(keys1.SK).not.toBe(keys2.SK);
    });
  });

  describe('Key pattern differentiation', () => {
    it('should differentiate between location and store keys', () => {
      const familyId = 'same-family';
      const entityId = 'same-id';

      const locationKeys = buildLocationKeys(familyId, entityId);
      const storeKeys = buildStoreKeys(familyId, entityId);

      expect(locationKeys.PK).toBe(storeKeys.PK); // Same family
      expect(locationKeys.SK).not.toBe(storeKeys.SK); // Different entity types
      expect(locationKeys.SK).toContain('LOCATION#');
      expect(storeKeys.SK).toContain('STORE#');
    });
  });
});
