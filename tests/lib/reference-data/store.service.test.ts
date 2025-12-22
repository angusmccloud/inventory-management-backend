/**
 * Unit Tests for Store Service
 * Feature: 005-reference-data
 */

import * as service from '../../../src/lib/reference-data/store.service';
import * as repository from '../../../src/lib/reference-data/repository';
import { 
  VersionConflictError,
  ReferenceExistsError 
} from '../../../src/lib/reference-data/errors';

jest.mock('../../../src/lib/reference-data/repository');

const mockUserContext = {
  userId: 'user-123',
  familyId: 'family-456',
  role: 'admin' as const,
};

const mockStore = {
  storeId: 'store-123',
  familyId: 'family-456',
  name: 'Costco',
  nameLower: 'costco',
  address: '123 Main St',
  version: 1,
  entityType: 'Store' as const,
  createdAt: '2025-12-10T10:00:00Z',
  updatedAt: '2025-12-10T10:00:00Z',
};

describe('Store Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createStore', () => {
    it('should create store when user is admin', async () => {
      (repository.createStore as jest.Mock).mockResolvedValue(mockStore);

      const result = await service.createStore('family-456', mockUserContext, {
        name: 'Costco',
        address: '123 Main St',
      });

      expect(result).toEqual(mockStore);
    });

    it('should trim whitespace from name before creating', async () => {
      (repository.createStore as jest.Mock).mockResolvedValue(mockStore);

      await service.createStore('family-456', mockUserContext, {
        name: '  Costco  ',
        address: '  123 Main St  ',
      });

      expect(repository.createStore).toHaveBeenCalledWith('family-456', {
        name: '  Costco  ',
        address: '  123 Main St  ',
      });
    });
  });

  describe('listStores', () => {
    it('should list all stores for family', async () => {
      const mockStores = [mockStore];
      (repository.listStores as jest.Mock).mockResolvedValue(mockStores);

      const result = await service.listStores('family-456', mockUserContext);

      expect(result).toEqual(mockStores);
    });
  });

  describe('updateStore', () => {
    it('should update store when user is admin', async () => {
      const updated = { ...mockStore, version: 2 };
      (repository.updateStore as jest.Mock).mockResolvedValue(updated);

      const result = await service.updateStore('family-456', mockUserContext, 'store-123', {
        name: 'Updated Costco',
        address: 'New Address',
        version: 1,
      });

      expect(result).toEqual(updated);
    });

    it('should handle version conflict error', async () => {
      const conflictError = new VersionConflictError(
        'Store',
        1,
        2,
        mockStore
      );
      (repository.updateStore as jest.Mock).mockRejectedValue(conflictError);

      await expect(
        service.updateStore('family-456', mockUserContext, 'store-123', {
          name: 'Updated',
          address: null,
          version: 1,
        })
      ).rejects.toThrow(VersionConflictError);
    });
  });

  describe('deleteStore', () => {
    it('should delete store when user is admin', async () => {
      (repository.deleteStore as jest.Mock).mockResolvedValue(undefined);

      await service.deleteStore('family-456', mockUserContext, 'store-123');

      expect(repository.deleteStore).toHaveBeenCalledWith('family-456', 'store-123');
    });

    it('should handle reference exists error from inventory items', async () => {
      const referenceError = new ReferenceExistsError(
        'Store',
        'store-123',
        'Costco',
        [
          { entityType: 'InventoryItem', count: 10 }
        ]
      );
      (repository.deleteStore as jest.Mock).mockRejectedValue(referenceError);

      await expect(
        service.deleteStore('family-456', mockUserContext, 'store-123')
      ).rejects.toThrow(ReferenceExistsError);
    });

    it('should handle reference exists error from shopping list items', async () => {
      const referenceError = new ReferenceExistsError(
        'Store',
        'store-123',
        'Costco',
        [
          { entityType: 'ShoppingListItem', count: 3 }
        ]
      );
      (repository.deleteStore as jest.Mock).mockRejectedValue(referenceError);

      await expect(
        service.deleteStore('family-456', mockUserContext, 'store-123')
      ).rejects.toThrow(ReferenceExistsError);
    });
  });

  describe('getStore', () => {
    it('should get store by ID', async () => {
      (repository.getStore as jest.Mock).mockResolvedValue(mockStore);

      const result = await service.getStore('family-456', mockUserContext, 'store-123');

      expect(result).toEqual(mockStore);
      expect(repository.getStore).toHaveBeenCalledWith('family-456', 'store-123');
    });

    it('should return null when store not found', async () => {
      (repository.getStore as jest.Mock).mockResolvedValue(null);

      const result = await service.getStore('family-456', mockUserContext, 'nonexistent');

      expect(result).toBeNull();
    });
  });
});
