/**
 * Tests for listShoppingListItems handler
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
}));

import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler } from '../../shopping-list/listShoppingListItems';
import { ShoppingListService } from '../../../services/shoppingListService';

describe('listShoppingListItems handler', () => {
  const mockContext = {
    awsRequestId: 'test-request-id',
  } as Context;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should list all shopping list items', async () => {
    const mockItems = [
      {
        shoppingItemId: 'item-1',
        familyId: 'family-456',
        name: 'Paper Towels',
        status: 'pending',
        storeId: 'store-1',
      },
      {
        shoppingItemId: 'item-2',
        familyId: 'family-456',
        name: 'Milk',
        status: 'purchased',
        storeId: 'store-1',
      },
    ];

    (ShoppingListService.listShoppingListItems as jest.Mock).mockResolvedValue(mockItems);
    (ShoppingListService.groupByStore as jest.Mock).mockResolvedValue({
      'store-1': mockItems,
    });

    const event = {
      pathParameters: { familyId: 'family-456' },
      queryStringParameters: null,
    } as unknown as APIGatewayProxyEvent;

    const result = await handler(event, mockContext, () => {});

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data.items).toHaveLength(2);
    expect(body.data.groupedByStore).toBeDefined();
  });

  it('should filter by store', async () => {
    const mockItems = [
      {
        shoppingItemId: 'item-1',
        familyId: 'family-456',
        name: 'Paper Towels',
        status: 'pending',
        storeId: 'store-1',
      },
    ];

    (ShoppingListService.listShoppingListItems as jest.Mock).mockResolvedValue(mockItems);
    (ShoppingListService.groupByStore as jest.Mock).mockResolvedValue({
      'store-1': mockItems,
    });

    const event = {
      pathParameters: { familyId: 'family-456' },
      queryStringParameters: { storeId: 'store-1' },
    } as unknown as APIGatewayProxyEvent;

    const result = await handler(event, mockContext, () => {});

    expect(result.statusCode).toBe(200);
    expect(ShoppingListService.listShoppingListItems).toHaveBeenCalledWith(
      'family-456',
      expect.objectContaining({ storeId: 'store-1' })
    );
  });

  it('should filter by unassigned store', async () => {
    const mockItems = [
      {
        shoppingItemId: 'item-1',
        familyId: 'family-456',
        name: 'Birthday Cake',
        status: 'pending',
        storeId: null,
      },
    ];

    (ShoppingListService.listShoppingListItems as jest.Mock).mockResolvedValue(mockItems);
    (ShoppingListService.groupByStore as jest.Mock).mockResolvedValue({
      unassigned: mockItems,
    });

    const event = {
      pathParameters: { familyId: 'family-456' },
      queryStringParameters: { storeId: 'unassigned' },
    } as unknown as APIGatewayProxyEvent;

    const result = await handler(event, mockContext, () => {});

    expect(result.statusCode).toBe(200);
    expect(ShoppingListService.listShoppingListItems).toHaveBeenCalledWith(
      'family-456',
      expect.objectContaining({ storeId: null })
    );
  });

  it('should filter by status', async () => {
    const mockItems = [
      {
        shoppingItemId: 'item-1',
        familyId: 'family-456',
        name: 'Paper Towels',
        status: 'pending',
      },
    ];

    (ShoppingListService.listShoppingListItems as jest.Mock).mockResolvedValue(mockItems);
    (ShoppingListService.groupByStore as jest.Mock).mockResolvedValue({});

    const event = {
      pathParameters: { familyId: 'family-456' },
      queryStringParameters: { status: 'pending' },
    } as unknown as APIGatewayProxyEvent;

    const result = await handler(event, mockContext, () => {});

    expect(result.statusCode).toBe(200);
    expect(ShoppingListService.listShoppingListItems).toHaveBeenCalledWith(
      'family-456',
      expect.objectContaining({ status: 'pending' })
    );
  });
});

