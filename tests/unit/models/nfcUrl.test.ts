/**
 * NFCUrl Model Unit Tests
 * 
 * Tests for NFCUrlModel DynamoDB operations with mocked docClient.
 * Verifies CRUD operations, query patterns, and error handling.
 */

import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { NFCUrlModel } from '../../../src/models/nfcUrl';
import { docClient } from '../../../src/lib/dynamodb';
import { generateUrlId } from '../../../src/lib/urlGenerator';
import { CreateNFCUrlInput, NFCUrl } from '../../../src/types/nfcUrl';

// Mock dependencies
jest.mock('../../../src/lib/dynamodb');
jest.mock('../../../src/lib/urlGenerator');
jest.mock('../../../src/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock getTableName
jest.mock('../../../src/lib/dynamodb', () => ({
  ...jest.requireActual('../../../src/lib/dynamodb'),
  getTableName: jest.fn(() => 'InventoryManagement'),
  docClient: {
    send: jest.fn(),
  },
}));

describe('NFCUrlModel', () => {
  const mockFamilyId = 'family-123';
  const mockItemId = 'item-456';
  const mockUrlId = '2gSZw8ZQPb7D5kN3X8mQ7';
  const mockItemName = 'Paper Towels';
  const mockCreatedBy = 'member-789';
  const mockNow = '2025-12-26T10:00:00.000Z';

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock Date.now for consistent timestamps
    jest.spyOn(global.Date.prototype, 'toISOString').mockReturnValue(mockNow);
    // Mock URL generation
    (generateUrlId as jest.Mock).mockReturnValue(mockUrlId);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('create', () => {
    const mockInput: CreateNFCUrlInput = {
      itemId: mockItemId,
      familyId: mockFamilyId,
      itemName: mockItemName,
      createdBy: mockCreatedBy,
    };

    const expectedNFCUrl: NFCUrl = {
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
      itemName: mockItemName,
      isActive: true,
      createdAt: mockNow,
      createdBy: mockCreatedBy,
      accessCount: 0,
    };

    it('should create a new NFC URL with correct key structure', async () => {
      (docClient.send as jest.Mock).mockResolvedValue({});

      const result = await NFCUrlModel.create(mockInput);

      expect(result).toEqual(expectedNFCUrl);
      expect(generateUrlId).toHaveBeenCalled();
      expect(docClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'InventoryManagement',
            Item: expectedNFCUrl,
            ConditionExpression: 'attribute_not_exists(PK)',
          }),
        })
      );
    });

    it('should generate unique URL ID for each creation', async () => {
      (docClient.send as jest.Mock).mockResolvedValue({});

      await NFCUrlModel.create(mockInput);

      expect(generateUrlId).toHaveBeenCalledTimes(1);
    });

    it('should throw error when DynamoDB put fails', async () => {
      const error = new Error('DynamoDB error');
      (docClient.send as jest.Mock).mockRejectedValue(error);

      await expect(NFCUrlModel.create(mockInput)).rejects.toThrow('DynamoDB error');
    });
  });

  describe('getByUrlId', () => {
    it('should query by GSI1 with correct key', async () => {
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
        itemName: mockItemName,
        isActive: true,
        createdAt: mockNow,
        createdBy: mockCreatedBy,
        accessCount: 5,
      };

      (docClient.send as jest.Mock).mockResolvedValue({
        Items: [mockNFCUrl],
      });

      const result = await NFCUrlModel.getByUrlId(mockUrlId);

      expect(result).toEqual(mockNFCUrl);
      expect(docClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'InventoryManagement',
            IndexName: 'GSI1',
            KeyConditionExpression: 'GSI1PK = :gsi1pk',
            ExpressionAttributeValues: {
              ':gsi1pk': `URL#${mockUrlId}`,
            },
            Limit: 1,
          }),
        })
      );
    });

    it('should return null when URL ID not found', async () => {
      (docClient.send as jest.Mock).mockResolvedValue({
        Items: [],
      });

      const result = await NFCUrlModel.getByUrlId('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw error when query fails', async () => {
      const error = new Error('Query error');
      (docClient.send as jest.Mock).mockRejectedValue(error);

      await expect(NFCUrlModel.getByUrlId(mockUrlId)).rejects.toThrow('Query error');
    });
  });

  describe('getByCompositeKey', () => {
    it('should get item by PK and SK', async () => {
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
        itemName: mockItemName,
        isActive: true,
        createdAt: mockNow,
        createdBy: mockCreatedBy,
        accessCount: 10,
      };

      (docClient.send as jest.Mock).mockResolvedValue({
        Item: mockNFCUrl,
      });

      const result = await NFCUrlModel.getByCompositeKey(mockFamilyId, mockItemId, mockUrlId);

      expect(result).toEqual(mockNFCUrl);
      expect(docClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'InventoryManagement',
            Key: {
              PK: `FAMILY#${mockFamilyId}`,
              SK: `ITEM#${mockItemId}#URL#${mockUrlId}`,
            },
          }),
        })
      );
    });

    it('should return null when item not found', async () => {
      (docClient.send as jest.Mock).mockResolvedValue({});

      const result = await NFCUrlModel.getByCompositeKey(mockFamilyId, mockItemId, mockUrlId);

      expect(result).toBeNull();
    });
  });

  describe('listByItem', () => {
    const mockActiveUrl: NFCUrl = {
      PK: `FAMILY#${mockFamilyId}`,
      SK: `ITEM#${mockItemId}#URL#url1`,
      GSI1PK: 'URL#url1',
      GSI1SK: `ITEM#${mockItemId}`,
      GSI2PK: `FAMILY#${mockFamilyId}#URLS`,
      GSI2SK: `CREATED#${mockNow}#URL#url1`,
      entityType: 'NFCUrl',
      urlId: 'url1',
      itemId: mockItemId,
      familyId: mockFamilyId,
      itemName: mockItemName,
      isActive: true,
      createdAt: mockNow,
      createdBy: mockCreatedBy,
      accessCount: 3,
    };

    const mockInactiveUrl: NFCUrl = {
      ...mockActiveUrl,
      SK: `ITEM#${mockItemId}#URL#url2`,
      GSI1PK: 'URL#url2',
      GSI2SK: `CREATED#${mockNow}#URL#url2`,
      urlId: 'url2',
      isActive: false,
      rotatedAt: '2025-12-27T10:00:00.000Z',
      rotatedBy: mockCreatedBy,
    };

    it('should list all active URLs for an item', async () => {
      (docClient.send as jest.Mock).mockResolvedValue({
        Items: [mockActiveUrl, mockInactiveUrl],
      });

      const result = await NFCUrlModel.listByItem(mockFamilyId, mockItemId);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockActiveUrl);
      expect(docClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'InventoryManagement',
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
              ':pk': `FAMILY#${mockFamilyId}`,
              ':sk': `ITEM#${mockItemId}#URL#`,
            },
          }),
        })
      );
    });

    it('should include inactive URLs when requested', async () => {
      (docClient.send as jest.Mock).mockResolvedValue({
        Items: [mockActiveUrl, mockInactiveUrl],
      });

      const result = await NFCUrlModel.listByItem(mockFamilyId, mockItemId, true);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual(mockActiveUrl);
      expect(result).toContainEqual(mockInactiveUrl);
    });

    it('should return empty array when no URLs exist', async () => {
      (docClient.send as jest.Mock).mockResolvedValue({
        Items: [],
      });

      const result = await NFCUrlModel.listByItem(mockFamilyId, mockItemId);

      expect(result).toEqual([]);
    });
  });

  describe('listByFamily', () => {
    it('should query by GSI2 with family key', async () => {
      const mockUrls: NFCUrl[] = [
        {
          PK: `FAMILY#${mockFamilyId}`,
          SK: `ITEM#${mockItemId}#URL#url1`,
          GSI1PK: 'URL#url1',
          GSI1SK: `ITEM#${mockItemId}`,
          GSI2PK: `FAMILY#${mockFamilyId}#URLS`,
          GSI2SK: `CREATED#${mockNow}#URL#url1`,
          entityType: 'NFCUrl',
          urlId: 'url1',
          itemId: mockItemId,
          familyId: mockFamilyId,
          itemName: mockItemName,
          isActive: true,
          createdAt: mockNow,
          createdBy: mockCreatedBy,
          accessCount: 5,
        },
      ];

      (docClient.send as jest.Mock).mockResolvedValue({
        Items: mockUrls,
      });

      const result = await NFCUrlModel.listByFamily(mockFamilyId);

      expect(result).toEqual(mockUrls);
      expect(docClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'InventoryManagement',
            IndexName: 'GSI2',
            KeyConditionExpression: 'GSI2PK = :gsi2pk',
            ExpressionAttributeValues: {
              ':gsi2pk': `FAMILY#${mockFamilyId}#URLS`,
            },
          }),
        })
      );
    });
  });

  describe('deactivate', () => {
    it('should deactivate URL with rotatedAt and rotatedBy', async () => {
      const mockUpdated: NFCUrl = {
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
        itemName: mockItemName,
        isActive: false,
        createdAt: mockNow,
        createdBy: mockCreatedBy,
        accessCount: 15,
        rotatedAt: mockNow,
        rotatedBy: mockCreatedBy,
      };

      (docClient.send as jest.Mock).mockResolvedValue({
        Attributes: mockUpdated,
      });

      const result = await NFCUrlModel.deactivate(
        mockFamilyId,
        mockItemId,
        mockUrlId,
        mockCreatedBy
      );

      expect(result).toEqual(mockUpdated);
      expect(result.isActive).toBe(false);
      expect(result.rotatedAt).toBe(mockNow);
      expect(docClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            UpdateExpression: 'SET isActive = :isActive, rotatedAt = :rotatedAt, rotatedBy = :rotatedBy',
            ConditionExpression: 'attribute_exists(PK)',
          }),
        })
      );
    });
  });

  describe('incrementAccessCount', () => {
    it('should atomically increment access count', async () => {
      (docClient.send as jest.Mock).mockResolvedValue({
        Attributes: {
          accessCount: 11,
          lastAccessedAt: mockNow,
        },
      });

      const result = await NFCUrlModel.incrementAccessCount(mockFamilyId, mockItemId, mockUrlId);

      expect(result).toBe(11);
      expect(docClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            UpdateExpression: 'SET accessCount = if_not_exists(accessCount, :zero) + :inc, lastAccessedAt = :now',
            ExpressionAttributeValues: {
              ':zero': 0,
              ':inc': 1,
              ':now': mockNow,
            },
          }),
        })
      );
    });
  });

  describe('updateItemName', () => {
    it('should update itemName in all URLs for an item', async () => {
      const mockUrls: NFCUrl[] = [
        {
          PK: `FAMILY#${mockFamilyId}`,
          SK: `ITEM#${mockItemId}#URL#url1`,
          GSI1PK: 'URL#url1',
          GSI1SK: `ITEM#${mockItemId}`,
          GSI2PK: `FAMILY#${mockFamilyId}#URLS`,
          GSI2SK: `CREATED#${mockNow}#URL#url1`,
          entityType: 'NFCUrl',
          urlId: 'url1',
          itemId: mockItemId,
          familyId: mockFamilyId,
          itemName: 'Old Name',
          isActive: true,
          createdAt: mockNow,
          createdBy: mockCreatedBy,
          accessCount: 3,
        },
        {
          PK: `FAMILY#${mockFamilyId}`,
          SK: `ITEM#${mockItemId}#URL#url2`,
          GSI1PK: 'URL#url2',
          GSI1SK: `ITEM#${mockItemId}`,
          GSI2PK: `FAMILY#${mockFamilyId}#URLS`,
          GSI2SK: `CREATED#${mockNow}#URL#url2`,
          entityType: 'NFCUrl',
          urlId: 'url2',
          itemId: mockItemId,
          familyId: mockFamilyId,
          itemName: 'Old Name',
          isActive: false,
          createdAt: mockNow,
          createdBy: mockCreatedBy,
          accessCount: 1,
        },
      ];

      (docClient.send as jest.Mock)
        .mockResolvedValueOnce({ Items: mockUrls }) // listByItem
        .mockResolvedValue({}); // update commands

      const result = await NFCUrlModel.updateItemName(mockFamilyId, mockItemId, 'New Item Name');

      expect(result).toBe(2);
      // First call is listByItem
      expect(docClient.send).toHaveBeenCalledTimes(3); // 1 list + 2 updates
    });

    it('should return 0 when no URLs exist for item', async () => {
      (docClient.send as jest.Mock).mockResolvedValue({ Items: [] });

      const result = await NFCUrlModel.updateItemName(mockFamilyId, mockItemId, 'New Name');

      expect(result).toBe(0);
    });
  });
});
