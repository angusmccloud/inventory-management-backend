/**
 * NFC Service Unit Tests
 * 
 * Tests for NfcService business logic with mocked models.
 */

import { NfcService } from '../../../src/services/nfcService';
import { NFCUrlModel } from '../../../src/models/nfcUrl';
import { InventoryItemModel } from '../../../src/models/inventory';
import { 
  NFCUrl, 
  CreateNFCUrlInput, 
  RotateNFCUrlInput,
  AdjustInventoryViaUrlInput,
} from '../../../src/types/nfcUrl';
import { InventoryItem } from '../../../src/types/entities';

// Mock dependencies
jest.mock('../../../src/models/nfcUrl');
jest.mock('../../../src/models/inventory');
jest.mock('../../../src/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('NfcService', () => {
  const mockFamilyId = 'family-123';
  const mockItemId = 'item-456';
  const mockUrlId = '2gSZw8ZQPb7D5kN3X8mQ7';
  const mockMemberId = 'member-789';
  const mockNow = '2025-12-26T10:00:00.000Z';

  const mockItem: InventoryItem = {
    PK: `FAMILY#${mockFamilyId}`,
    SK: `ITEM#${mockItemId}`,
    GSI1PK: `FAMILY#${mockFamilyId}#ITEMS`,
    GSI1SK: 'STATUS#active#NAME#Paper Towels',
    GSI2PK: `FAMILY#${mockFamilyId}#ITEMS`,
    GSI2SK: 'STATUS#active#QTY#0005',
    itemId: mockItemId,
    familyId: mockFamilyId,
    name: 'Paper Towels',
    quantity: 5,
    unit: 'rolls',
    locationId: 'loc-123',
    locationName: 'Pantry',
    lowStockThreshold: 3,
    status: 'active',
    createdBy: mockMemberId,
    lastModifiedBy: mockMemberId,
    entityType: 'InventoryItem',
    createdAt: mockNow,
    updatedAt: mockNow,
  };

  const mockNFCUrl: NFCUrl = {
    PK: `FAMILY#${mockFamilyId}`,
    SK: `ITEM#${mockItemId}#URL#${mockUrlId}`,
    GSI1PK: `URL#${mockUrlId}`,
    GSI1SK: `ITEM#${mockItemId}`,
    GSI2PK: `FAMILY#${mockFamilyId}#URLS`,
    GSI2SK: `CREATED#${mockNow}#URL#${mockUrlId}`,
    entityType: 'NFCUrl',
    urlId: mockUrlId,
    itemId: mockItemId,
    familyId: mockFamilyId,
    itemName: 'Paper Towels',
    isActive: true,
    createdAt: mockNow,
    createdBy: mockMemberId,
    accessCount: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateUrl', () => {
    const mockInput: CreateNFCUrlInput = {
      itemId: mockItemId,
      familyId: mockFamilyId,
      itemName: 'Paper Towels',
      createdBy: mockMemberId,
    };

    it('should generate NFC URL for valid active item', async () => {
      (InventoryItemModel.getById as jest.Mock).mockResolvedValue(mockItem);
      (NFCUrlModel.create as jest.Mock).mockResolvedValue(mockNFCUrl);

      const result = await NfcService.generateUrl(mockInput);

      expect(result).toEqual(mockNFCUrl);
      expect(InventoryItemModel.getById).toHaveBeenCalledWith(mockFamilyId, mockItemId);
      expect(NFCUrlModel.create).toHaveBeenCalledWith({
        ...mockInput,
        itemName: mockItem.name,
      });
    });

    it('should throw error when item does not exist', async () => {
      (InventoryItemModel.getById as jest.Mock).mockResolvedValue(null);

      await expect(NfcService.generateUrl(mockInput)).rejects.toThrow('Inventory item not found');
      expect(NFCUrlModel.create).not.toHaveBeenCalled();
    });

    it('should throw error when item is archived', async () => {
      const archivedItem = { ...mockItem, status: 'archived' };
      (InventoryItemModel.getById as jest.Mock).mockResolvedValue(archivedItem);

      await expect(NfcService.generateUrl(mockInput)).rejects.toThrow(
        'Cannot generate NFC URL for archived item'
      );
      expect(NFCUrlModel.create).not.toHaveBeenCalled();
    });

    it('should use current item name when generating URL', async () => {
      const itemWithDifferentName = { ...mockItem, name: 'Updated Name' };
      (InventoryItemModel.getById as jest.Mock).mockResolvedValue(itemWithDifferentName);
      (NFCUrlModel.create as jest.Mock).mockResolvedValue(mockNFCUrl);

      await NfcService.generateUrl(mockInput);

      expect(NFCUrlModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          itemName: 'Updated Name',
        })
      );
    });
  });

  describe('validateUrl', () => {
    it('should return valid for active URL with existing item', async () => {
      (NFCUrlModel.getByUrlId as jest.Mock).mockResolvedValue(mockNFCUrl);
      (InventoryItemModel.getById as jest.Mock).mockResolvedValue(mockItem);

      const result = await NfcService.validateUrl(mockUrlId);

      expect(result.isValid).toBe(true);
      expect(result.nfcUrl).toEqual(mockNFCUrl);
      expect(result.errorCode).toBeUndefined();
    });

    it('should return NOT_FOUND when URL does not exist', async () => {
      (NFCUrlModel.getByUrlId as jest.Mock).mockResolvedValue(null);

      const result = await NfcService.validateUrl('nonexistent');

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe('NOT_FOUND');
      expect(result.errorMessage).toBe('NFC URL not found');
    });

    it('should return INACTIVE when URL is deactivated', async () => {
      const inactiveUrl = { ...mockNFCUrl, isActive: false, rotatedAt: mockNow };
      (NFCUrlModel.getByUrlId as jest.Mock).mockResolvedValue(inactiveUrl);

      const result = await NfcService.validateUrl(mockUrlId);

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe('INACTIVE');
      expect(result.errorMessage).toContain('deactivated');
    });

    it('should return ITEM_DELETED when item no longer exists', async () => {
      (NFCUrlModel.getByUrlId as jest.Mock).mockResolvedValue(mockNFCUrl);
      (InventoryItemModel.getById as jest.Mock).mockResolvedValue(null);

      const result = await NfcService.validateUrl(mockUrlId);

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe('ITEM_DELETED');
      expect(result.errorMessage).toContain('no longer exists');
    });
  });

  describe('adjustInventory', () => {
    const mockAdjustInput: AdjustInventoryViaUrlInput = {
      urlId: mockUrlId,
      delta: -1,
    };

    it('should adjust inventory and return new quantity', async () => {
      (NFCUrlModel.getByUrlId as jest.Mock).mockResolvedValue(mockNFCUrl);
      (InventoryItemModel.getById as jest.Mock).mockResolvedValue(mockItem);
      (InventoryItemModel.update as jest.Mock).mockResolvedValue({
        ...mockItem,
        quantity: 4,
      });
      (NFCUrlModel.incrementAccessCount as jest.Mock).mockResolvedValue(1);

      const result = await NfcService.adjustInventory(mockAdjustInput);

      expect(result.success).toBe(true);
      expect(result.newQuantity).toBe(4);
      expect(result.itemName).toBe('Paper Towels');
      expect(result.delta).toBe(-1);
      expect(InventoryItemModel.update).toHaveBeenCalledWith(
        mockFamilyId,
        mockItemId,
        expect.objectContaining({
          quantity: 4,
          lastModifiedBy: 'system:nfc',
        })
      );
    });

    it('should enforce minimum quantity of 0', async () => {
      const lowStockItem = { ...mockItem, quantity: 0 };
      (NFCUrlModel.getByUrlId as jest.Mock).mockResolvedValue(mockNFCUrl);
      (InventoryItemModel.getById as jest.Mock).mockResolvedValue(lowStockItem);
      (InventoryItemModel.update as jest.Mock).mockResolvedValue({
        ...lowStockItem,
        quantity: 0,
      });
      (NFCUrlModel.incrementAccessCount as jest.Mock).mockResolvedValue(1);

      const result = await NfcService.adjustInventory({
        urlId: mockUrlId,
        delta: -1,
      });

      expect(result.success).toBe(true);
      expect(result.newQuantity).toBe(0);
      expect(InventoryItemModel.update).toHaveBeenCalledWith(
        mockFamilyId,
        mockItemId,
        expect.objectContaining({
          quantity: 0, // Should not go below 0
        })
      );
    });

    it('should handle positive delta (increment)', async () => {
      (NFCUrlModel.getByUrlId as jest.Mock).mockResolvedValue(mockNFCUrl);
      (InventoryItemModel.getById as jest.Mock).mockResolvedValue(mockItem);
      (InventoryItemModel.update as jest.Mock).mockResolvedValue({
        ...mockItem,
        quantity: 6,
      });
      (NFCUrlModel.incrementAccessCount as jest.Mock).mockResolvedValue(1);

      const result = await NfcService.adjustInventory({
        urlId: mockUrlId,
        delta: 1,
      });

      expect(result.success).toBe(true);
      expect(result.newQuantity).toBe(6);
      expect(InventoryItemModel.update).toHaveBeenCalledWith(
        mockFamilyId,
        mockItemId,
        expect.objectContaining({
          quantity: 6,
        })
      );
    });

    it('should return error when URL is invalid', async () => {
      (NFCUrlModel.getByUrlId as jest.Mock).mockResolvedValue(null);

      const result = await NfcService.adjustInventory(mockAdjustInput);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('URL_INVALID');
      expect(InventoryItemModel.update).not.toHaveBeenCalled();
    });

    it('should return error when URL is inactive', async () => {
      const inactiveUrl = { ...mockNFCUrl, isActive: false };
      (NFCUrlModel.getByUrlId as jest.Mock).mockResolvedValue(inactiveUrl);
      (InventoryItemModel.getById as jest.Mock).mockResolvedValue(mockItem);

      const result = await NfcService.adjustInventory(mockAdjustInput);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INACTIVE');
      expect(InventoryItemModel.update).not.toHaveBeenCalled();
    });

    it('should increment access count asynchronously', async () => {
      (NFCUrlModel.getByUrlId as jest.Mock).mockResolvedValue(mockNFCUrl);
      (InventoryItemModel.getById as jest.Mock).mockResolvedValue(mockItem);
      (InventoryItemModel.update as jest.Mock).mockResolvedValue({
        ...mockItem,
        quantity: 4,
      });
      (NFCUrlModel.incrementAccessCount as jest.Mock).mockResolvedValue(1);

      await NfcService.adjustInventory(mockAdjustInput);

      // Wait a tick for async fire-and-forget operation
      await new Promise(resolve => setImmediate(resolve));

      expect(NFCUrlModel.incrementAccessCount).toHaveBeenCalledWith(
        mockFamilyId,
        mockItemId,
        mockUrlId
      );
    });
  });

  describe('rotateUrl', () => {
    const mockRotateInput: RotateNFCUrlInput = {
      urlId: mockUrlId,
      familyId: mockFamilyId,
      rotatedBy: mockMemberId,
    };

    const newUrlId = '7pQm3nX8kD5wZ2gS9YbN4';
    const mockNewUrl: NFCUrl = {
      ...mockNFCUrl,
      urlId: newUrlId,
      GSI1PK: `URL#${newUrlId}`,
      SK: `ITEM#${mockItemId}#URL#${newUrlId}`,
      GSI2SK: `CREATED#${mockNow}#URL#${newUrlId}`,
    };

    it('should deactivate old URL and create new one', async () => {
      (NFCUrlModel.getByUrlId as jest.Mock).mockResolvedValue(mockNFCUrl);
      (NFCUrlModel.deactivate as jest.Mock).mockResolvedValue({
        ...mockNFCUrl,
        isActive: false,
      });
      (InventoryItemModel.getById as jest.Mock).mockResolvedValue(mockItem);
      (NFCUrlModel.create as jest.Mock).mockResolvedValue(mockNewUrl);

      const result = await NfcService.rotateUrl(mockRotateInput);

      expect(result.urlId).toBe(newUrlId);
      expect(result.isActive).toBe(true);
      expect(NFCUrlModel.deactivate).toHaveBeenCalledWith(
        mockFamilyId,
        mockItemId,
        mockUrlId,
        mockMemberId
      );
      expect(NFCUrlModel.create).toHaveBeenCalledWith({
        itemId: mockItemId,
        familyId: mockFamilyId,
        itemName: mockItem.name,
        createdBy: mockMemberId,
      });
    });

    it('should throw error when URL does not exist', async () => {
      (NFCUrlModel.getByUrlId as jest.Mock).mockResolvedValue(null);

      await expect(NfcService.rotateUrl(mockRotateInput)).rejects.toThrow('NFC URL not found');
      expect(NFCUrlModel.deactivate).not.toHaveBeenCalled();
    });

    it('should throw error when family ID mismatch', async () => {
      const wrongFamilyUrl = { ...mockNFCUrl, familyId: 'different-family' };
      (NFCUrlModel.getByUrlId as jest.Mock).mockResolvedValue(wrongFamilyUrl);

      await expect(NfcService.rotateUrl(mockRotateInput)).rejects.toThrow('Family ID mismatch');
      expect(NFCUrlModel.deactivate).not.toHaveBeenCalled();
    });

    it('should throw error when item no longer exists', async () => {
      (NFCUrlModel.getByUrlId as jest.Mock).mockResolvedValue(mockNFCUrl);
      (NFCUrlModel.deactivate as jest.Mock).mockResolvedValue({
        ...mockNFCUrl,
        isActive: false,
      });
      (InventoryItemModel.getById as jest.Mock).mockResolvedValue(null);

      await expect(NfcService.rotateUrl(mockRotateInput)).rejects.toThrow('Item no longer exists');
      expect(NFCUrlModel.create).not.toHaveBeenCalled();
    });

    it('should use current item name in new URL', async () => {
      const updatedItem = { ...mockItem, name: 'Updated Paper Towels' };
      (NFCUrlModel.getByUrlId as jest.Mock).mockResolvedValue(mockNFCUrl);
      (NFCUrlModel.deactivate as jest.Mock).mockResolvedValue({
        ...mockNFCUrl,
        isActive: false,
      });
      (InventoryItemModel.getById as jest.Mock).mockResolvedValue(updatedItem);
      (NFCUrlModel.create as jest.Mock).mockResolvedValue(mockNewUrl);

      await NfcService.rotateUrl(mockRotateInput);

      expect(NFCUrlModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          itemName: 'Updated Paper Towels',
        })
      );
    });
  });

  describe('listUrlsForItem', () => {
    it('should list URLs for valid item', async () => {
      const mockUrls = [mockNFCUrl];
      (InventoryItemModel.getById as jest.Mock).mockResolvedValue(mockItem);
      (NFCUrlModel.listByItem as jest.Mock).mockResolvedValue(mockUrls);

      const result = await NfcService.listUrlsForItem(mockFamilyId, mockItemId);

      expect(result).toEqual(mockUrls);
      expect(NFCUrlModel.listByItem).toHaveBeenCalledWith(mockFamilyId, mockItemId, false);
    });

    it('should throw error when item does not exist', async () => {
      (InventoryItemModel.getById as jest.Mock).mockResolvedValue(null);

      await expect(
        NfcService.listUrlsForItem(mockFamilyId, mockItemId)
      ).rejects.toThrow('Inventory item not found');
    });

    it('should include inactive URLs when requested', async () => {
      const mockUrls = [mockNFCUrl, { ...mockNFCUrl, isActive: false }];
      (InventoryItemModel.getById as jest.Mock).mockResolvedValue(mockItem);
      (NFCUrlModel.listByItem as jest.Mock).mockResolvedValue(mockUrls);

      await NfcService.listUrlsForItem(mockFamilyId, mockItemId, true);

      expect(NFCUrlModel.listByItem).toHaveBeenCalledWith(mockFamilyId, mockItemId, true);
    });
  });

  describe('listUrlsForFamily', () => {
    it('should list all URLs for family', async () => {
      const mockUrls = [mockNFCUrl];
      (NFCUrlModel.listByFamily as jest.Mock).mockResolvedValue(mockUrls);

      const result = await NfcService.listUrlsForFamily(mockFamilyId);

      expect(result).toEqual(mockUrls);
      expect(NFCUrlModel.listByFamily).toHaveBeenCalledWith(mockFamilyId, false);
    });

    it('should include inactive URLs when requested', async () => {
      const mockUrls = [mockNFCUrl, { ...mockNFCUrl, isActive: false }];
      (NFCUrlModel.listByFamily as jest.Mock).mockResolvedValue(mockUrls);

      await NfcService.listUrlsForFamily(mockFamilyId, true);

      expect(NFCUrlModel.listByFamily).toHaveBeenCalledWith(mockFamilyId, true);
    });
  });

  describe('updateItemNameInUrls', () => {
    it('should update item name in all URLs', async () => {
      (NFCUrlModel.updateItemName as jest.Mock).mockResolvedValue(3);

      const result = await NfcService.updateItemNameInUrls(
        mockFamilyId,
        mockItemId,
        'New Name'
      );

      expect(result).toBe(3);
      expect(NFCUrlModel.updateItemName).toHaveBeenCalledWith(
        mockFamilyId,
        mockItemId,
        'New Name'
      );
    });
  });

  describe('getUrlById', () => {
    it('should return URL when found', async () => {
      (NFCUrlModel.getByUrlId as jest.Mock).mockResolvedValue(mockNFCUrl);

      const result = await NfcService.getUrlById(mockUrlId);

      expect(result).toEqual(mockNFCUrl);
    });

    it('should return null when URL not found', async () => {
      (NFCUrlModel.getByUrlId as jest.Mock).mockResolvedValue(null);

      const result = await NfcService.getUrlById('nonexistent');

      expect(result).toBeNull();
    });
  });
});
