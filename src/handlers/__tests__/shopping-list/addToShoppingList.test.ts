/**
 * Tests for addToShoppingList handler
 * Feature: 002-shopping-lists
 */

// Mock modules (hoisted by Jest)
jest.mock('../../../lib/logger', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  
  const mockCreateLambdaLogger = jest.fn().mockReturnValue(mockLogger);
  
  return {
    logger: mockLogger,
    createLambdaLogger: mockCreateLambdaLogger,
    logLambdaInvocation: jest.fn(),
    logLambdaCompletion: jest.fn(),
  };
});

jest.mock('../../../services/shoppingListService');
jest.mock('../../../lib/auth', () => ({
  getUserContext: jest.fn(() => ({
    memberId: 'member-123',
    familyId: 'family-456',
    role: 'admin',
  })),
  requireFamilyAccess: jest.fn(),
  requireAdmin: jest.fn(),
}));

import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler } from '../../shopping-list/addToShoppingList';
import { ShoppingListService } from '../../../services/shoppingListService';

describe('addToShoppingList handler', () => {
  const mockContext = {
    awsRequestId: 'test-request-id',
  } as Context;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully add a free-text item to shopping list', async () => {
    const mockItem = {
      shoppingItemId: 'shopping-123',
      familyId: 'family-456',
      itemId: null,
      name: 'Birthday Cake',
      storeId: null,
      status: 'pending',
      quantity: 1,
      notes: 'For party',
      version: 1,
      ttl: null,
      addedBy: 'member-123',
      entityType: 'ShoppingListItem',
      createdAt: '2025-12-10T12:00:00Z',
      updatedAt: '2025-12-10T12:00:00Z',
    };

    (ShoppingListService.addToShoppingList as jest.Mock).mockResolvedValue({
      success: true,
      item: mockItem,
    });

    const event = {
      pathParameters: { familyId: 'family-456' },
      body: JSON.stringify({
        name: 'Birthday Cake',
        quantity: 1,
        notes: 'For party',
      }),
    } as unknown as APIGatewayProxyEvent;

    const result = await handler(event, mockContext, () => {});

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.data.name).toBe('Birthday Cake');
    expect(body.data.status).toBe('pending');
    expect(body.data.version).toBe(1);
  });

  it('should return 409 when duplicate item exists', async () => {
    const existingItem = {
      shoppingItemId: 'existing-123',
      name: 'Paper Towels',
      status: 'pending',
    };

    (ShoppingListService.addToShoppingList as jest.Mock).mockResolvedValue({
      success: false,
      duplicate: {
        item: existingItem,
        message: 'This item is already on your shopping list',
      },
    });

    const event = {
      pathParameters: { familyId: 'family-456' },
      body: JSON.stringify({
        itemId: 'inventory-789',
      }),
    } as unknown as APIGatewayProxyEvent;

    const result = await handler(event, mockContext, () => {});

    expect(result.statusCode).toBe(409);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('Conflict');
    expect(body.existingItem).toBeDefined();
  });

  it('should return 404 when inventory item not found', async () => {
    (ShoppingListService.addToShoppingList as jest.Mock).mockRejectedValue(
      new Error('INVENTORY_ITEM_NOT_FOUND')
    );

    const event = {
      pathParameters: { familyId: 'family-456' },
      body: JSON.stringify({
        itemId: 'nonexistent-item',
      }),
    } as unknown as APIGatewayProxyEvent;

    const result = await handler(event, mockContext, () => {});

    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body);
    expect(body.error.message).toContain('not found');
  });

  it('should return 400 for invalid request body', async () => {
    const event = {
      pathParameters: { familyId: 'family-456' },
      body: JSON.stringify({
        // Missing both itemId and name - should fail validation
      }),
    } as unknown as APIGatewayProxyEvent;

    const result = await handler(event, mockContext, () => {});

    expect(result.statusCode).toBe(400);
  });

  it('should allow duplicate when force=true', async () => {
    const mockItem = {
      shoppingItemId: 'shopping-456',
      familyId: 'family-456',
      itemId: 'inventory-789',
      name: 'Paper Towels',
      status: 'pending',
      version: 1,
    };

    (ShoppingListService.addToShoppingList as jest.Mock).mockResolvedValue({
      success: true,
      item: mockItem,
    });

    const event = {
      pathParameters: { familyId: 'family-456' },
      body: JSON.stringify({
        itemId: 'inventory-789',
        force: true,
      }),
    } as unknown as APIGatewayProxyEvent;

    const result = await handler(event, mockContext, () => {});

    expect(result.statusCode).toBe(201);
    expect(ShoppingListService.addToShoppingList).toHaveBeenCalledWith(
      'family-456',
      'member-123',
      expect.objectContaining({ force: true })
    );
  });
});

