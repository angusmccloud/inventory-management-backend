/**
 * ShoppingListService Unit Tests
 *
 * Tests notification resolution behavior when adding items.
 */

jest.mock('../../src/models/shoppingList', () => ({
  ShoppingListModel: {
    create: jest.fn(),
    findDuplicateByItemId: jest.fn(),
  },
}));

jest.mock('../../src/models/inventory', () => ({
  InventoryItemModel: {
    getById: jest.fn(),
  },
}));

jest.mock('../../src/services/notificationService', () => ({
  NotificationService: {
    resolveNotificationsForItem: jest.fn(),
  },
}));

jest.mock('../../src/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { ShoppingListService } from '../../src/services/shoppingListService';
import { ShoppingListModel } from '../../src/models/shoppingList';
import { InventoryItemModel } from '../../src/models/inventory';
import { NotificationService } from '../../src/services/notificationService';
import { CreateShoppingListItemRequest, ShoppingListItem } from '../../src/types/shoppingList';

describe('ShoppingListService.addToShoppingList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves notifications when adding an inventory-linked item', async () => {
    const familyId = 'family-123';
    const memberId = 'member-456';
    const request: CreateShoppingListItemRequest = {
      itemId: 'item-789',
    };

    (ShoppingListModel.findDuplicateByItemId as jest.Mock).mockResolvedValue(null);
    (InventoryItemModel.getById as jest.Mock).mockResolvedValue({
      name: 'Paper Towels',
      preferredStoreId: 'store-111',
      unit: 'roll',
    });

    const createdItem: ShoppingListItem = {
      shoppingItemId: 'shopping-999',
      familyId,
      itemId: 'item-789',
      name: 'Paper Towels',
      storeId: 'store-111',
      status: 'pending',
      quantity: null,
      unit: 'roll',
      notes: null,
      version: 1,
      ttl: null,
      addedBy: memberId,
      entityType: 'ShoppingListItem',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      PK: `FAMILY#${familyId}`,
      SK: 'SHOPPING#shopping-999',
      GSI2PK: `FAMILY#${familyId}#SHOPPING`,
      GSI2SK: 'STORE#store-111#STATUS#pending',
    };

    (ShoppingListModel.create as jest.Mock).mockResolvedValue(createdItem);

    const result = await ShoppingListService.addToShoppingList(familyId, memberId, request);

    expect(result.success).toBe(true);
    expect(InventoryItemModel.getById).toHaveBeenCalledWith(familyId, 'item-789');
    expect(NotificationService.resolveNotificationsForItem).toHaveBeenCalledWith(
      familyId,
      'item-789'
    );
  });

  it('does not resolve notifications for free-text items', async () => {
    const familyId = 'family-123';
    const memberId = 'member-456';
    const request: CreateShoppingListItemRequest = {
      name: 'Birthday Cake',
    };

    const createdItem: ShoppingListItem = {
      shoppingItemId: 'shopping-1000',
      familyId,
      itemId: null,
      name: 'Birthday Cake',
      storeId: null,
      status: 'pending',
      quantity: 1,
      unit: null,
      notes: 'For party',
      version: 1,
      ttl: null,
      addedBy: memberId,
      entityType: 'ShoppingListItem',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      PK: `FAMILY#${familyId}`,
      SK: 'SHOPPING#shopping-1000',
      GSI2PK: `FAMILY#${familyId}#SHOPPING`,
      GSI2SK: 'STORE#UNASSIGNED#STATUS#pending',
    };

    (ShoppingListModel.create as jest.Mock).mockResolvedValue(createdItem);

    const result = await ShoppingListService.addToShoppingList(familyId, memberId, request);

    expect(result.success).toBe(true);
    expect(InventoryItemModel.getById).not.toHaveBeenCalled();
    expect(NotificationService.resolveNotificationsForItem).not.toHaveBeenCalled();
  });
});
