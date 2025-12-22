/**
 * Unit Tests for Storage Location Service
 * Feature: 005-reference-data
 * 
 * Note: These are simplified tests focusing on service layer logic.
 * Full integration tests with DynamoDB are in integration test files.
 */

import * as service from '../../../src/lib/reference-data/storage-location.service';
import * as repository from '../../../src/lib/reference-data/repository';
import { 
  NotFoundError, 
  VersionConflictError,
  ReferenceExistsError 
} from '../../../src/lib/reference-data/errors';

// Mock the repository module
jest.mock('../../../src/lib/reference-data/repository');

// Mock the MemberModel module
jest.mock('../../../src/models/member', () => ({
  MemberModel: {
    getById: jest.fn().mockResolvedValue({
      memberId: 'user-123',
      familyId: 'family-456',
      role: 'admin',
      status: 'active',
    }),
  },
}));

const mockUserContext = {
  userId: 'user-123',
  familyId: 'family-456',
  role: 'admin' as const,
};

const mockLocation = {
  locationId: 'loc-123',
  familyId: 'family-456',
  name: 'Pantry',
  nameLower: 'pantry',
  description: 'Kitchen pantry',
  version: 1,
  entityType: 'StorageLocation' as const,
  createdAt: '2025-12-10T10:00:00Z',
  updatedAt: '2025-12-10T10:00:00Z',
};

describe('Storage Location Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createStorageLocation', () => {
    it('should create location when user is admin', async () => {
      (repository.createStorageLocation as jest.Mock).mockResolvedValue(mockLocation);

      const result = await service.createStorageLocation('family-456', mockUserContext, {
        name: 'Pantry',
        description: 'Kitchen pantry',
      });

      expect(result).toEqual(mockLocation);
      expect(repository.createStorageLocation).toHaveBeenCalledWith('family-456', {
        name: 'Pantry',
        description: 'Kitchen pantry',
      });
    });

    it('should trim whitespace from name before creating', async () => {
      (repository.createStorageLocation as jest.Mock).mockResolvedValue(mockLocation);

      await service.createStorageLocation('family-456', mockUserContext, {
        name: '  Pantry  ',
        description: '  Kitchen pantry  ',
      });

      expect(repository.createStorageLocation).toHaveBeenCalledWith('family-456', {
        name: '  Pantry  ',
        description: '  Kitchen pantry  ',
      });
    });
  });

  describe('listStorageLocations', () => {
    it('should list all locations for family', async () => {
      const mockLocations = [mockLocation];
      (repository.listStorageLocations as jest.Mock).mockResolvedValue(mockLocations);

      const result = await service.listStorageLocations('family-456', mockUserContext);

      expect(result).toEqual(mockLocations);
      expect(repository.listStorageLocations).toHaveBeenCalledWith('family-456');
    });
  });

  describe('getStorageLocation', () => {
    it('should get location by ID', async () => {
      (repository.getStorageLocation as jest.Mock).mockResolvedValue(mockLocation);

      const result = await service.getStorageLocation('family-456', mockUserContext, 'loc-123');

      expect(result).toEqual(mockLocation);
      expect(repository.getStorageLocation).toHaveBeenCalledWith('family-456', 'loc-123');
    });

    it('should return null when location not found', async () => {
      (repository.getStorageLocation as jest.Mock).mockResolvedValue(null);

      const result = await service.getStorageLocation('family-456', mockUserContext, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateStorageLocation', () => {
    it('should update location when user is admin', async () => {
      const updated = { ...mockLocation, version: 2, name: 'Updated Pantry' };
      (repository.updateStorageLocation as jest.Mock).mockResolvedValue(updated);

      const result = await service.updateStorageLocation('family-456', mockUserContext, 'loc-123', {
        name: 'Updated Pantry',
        description: 'Updated description',
        version: 1,
      });

      expect(result).toEqual(updated);
    });

    it('should handle version conflict error', async () => {
      const conflictError = new VersionConflictError(
        'StorageLocation',
        1,
        2,
        mockLocation
      );
      (repository.updateStorageLocation as jest.Mock).mockRejectedValue(conflictError);

      await expect(
        service.updateStorageLocation('family-456', mockUserContext, 'loc-123', {
          name: 'Updated',
          description: null,
          version: 1,
        })
      ).rejects.toThrow(VersionConflictError);
    });
  });

  describe('deleteStorageLocation', () => {
    it('should delete location when user is admin', async () => {
      (repository.deleteStorageLocation as jest.Mock).mockResolvedValue(undefined);

      await service.deleteStorageLocation('family-456', mockUserContext, 'loc-123');

      expect(repository.deleteStorageLocation).toHaveBeenCalledWith('family-456', 'loc-123');
    });

    it('should handle reference exists error', async () => {
      const referenceError = new ReferenceExistsError(
        'StorageLocation',
        'loc-123',
        'Pantry',
        [
          { entityType: 'InventoryItem', count: 5 }
        ]
      );
      (repository.deleteStorageLocation as jest.Mock).mockRejectedValue(referenceError);

      await expect(
        service.deleteStorageLocation('family-456', mockUserContext, 'loc-123')
      ).rejects.toThrow(ReferenceExistsError);
    });
  });
});
