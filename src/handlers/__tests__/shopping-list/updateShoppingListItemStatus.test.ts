/**
 * Tests for updateShoppingListItemStatus handler
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
import { handler } from '../../shopping-list/updateShoppingListItemStatus';
import { ShoppingListService } from '../../../services/shoppingListService';

describe('updateShoppingListItemStatus handler', () => {
  const mockContext = {
    awsRequestId: 'test-request-id',
  } as Context;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully toggle status to purchased with TTL', async () => {
    const mockItem = {
      shoppingItemId: 'shopping-123',
      familyId: 'family-456',
      name: 'Paper Towels',
      status: 'purchased',
      version: 2,
      ttl: 1734451200, // 7 days from now
    };

    (ShoppingListService.updateStatus as jest.Mock).mockResolvedValue({
      success: true,
      item: mockItem,
    });

    const event = {
      pathParameters: {
        familyId: 'family-456',
        shoppingItemId: 'shopping-123',
      },
      body: JSON.stringify({
        status: 'purchased',
        version: 1,
      }),
    } as unknown as APIGatewayProxyEvent;

    const result = await handler(event, mockContext, () => {});

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data.status).toBe('purchased');
    expect(body.data.version).toBe(2);
    expect(body.data.ttl).toBeDefined();
  });

  it('should successfully toggle status to pending and clear TTL', async () => {
    const mockItem = {
      shoppingItemId: 'shopping-123',
      familyId: 'family-456',
      name: 'Paper Towels',
      status: 'pending',
      version: 3,
      ttl: null,
    };

    (ShoppingListService.updateStatus as jest.Mock).mockResolvedValue({
      success: true,
      item: mockItem,
    });

    const event = {
      pathParameters: {
        familyId: 'family-456',
        shoppingItemId: 'shopping-123',
      },
      body: JSON.stringify({
        status: 'pending',
        version: 2,
      }),
    } as unknown as APIGatewayProxyEvent;

    const result = await handler(event, mockContext, () => {});

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data.status).toBe('pending');
    expect(body.data.ttl).toBeNull();
  });

  it('should return 409 on optimistic locking conflict', async () => {
    const currentItem = {
      shoppingItemId: 'shopping-123',
      familyId: 'family-456',
      name: 'Paper Towels',
      status: 'purchased',
      version: 3,
    };

    (ShoppingListService.updateStatus as jest.Mock).mockResolvedValue({
      success: false,
      conflict: {
        currentItem,
        message: 'Item was modified by another user. Please refresh and try again.',
      },
    });

    const event = {
      pathParameters: {
        familyId: 'family-456',
        shoppingItemId: 'shopping-123',
      },
      body: JSON.stringify({
        status: 'pending',
        version: 1, // Outdated version
      }),
    } as unknown as APIGatewayProxyEvent;

    const result = await handler(event, mockContext, () => {});

    expect(result.statusCode).toBe(409);
    const body = JSON.parse(result.body);
    expect(body.currentItem).toBeDefined();
    expect(body.currentItem.version).toBe(3);
  });

  it('should return 400 for missing version', async () => {
    const event = {
      pathParameters: {
        familyId: 'family-456',
        shoppingItemId: 'shopping-123',
      },
      body: JSON.stringify({
        status: 'purchased',
        // Missing version
      }),
    } as unknown as APIGatewayProxyEvent;

    const result = await handler(event, mockContext, () => {});

    expect(result.statusCode).toBe(400);
  });
});

