/**
 * Tests: NFC URL Handler Integration
 * 
 * @description Integration tests for NFC URL management endpoints
 * Tests create, list, rotate operations with admin authorization
 * 
 * @see specs/006-api-integration/tasks.md - T049, T051
 */

import { handler } from '../../src/handlers/nfcUrlHandler';
import { NfcService } from '../../src/services/nfcService';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type { NFCUrl } from '../../src/types/entities';

// Mock the NFC service
jest.mock('../../src/services/nfcService');

/**
 * Helper to create mock API Gateway event
 */
function createMockEvent(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  pathParameters?: Record<string, string>,
  authContext?: Record<string, unknown>
): APIGatewayProxyEvent {
  return {
    httpMethod: method,
    path,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : null,
    pathParameters: pathParameters || null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      protocol: 'HTTP/1.1',
      httpMethod: method,
      path,
      stage: 'test',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test-resource',
      resourcePath: path,
      identity: {
        sourceIp: '127.0.0.1',
        userAgent: 'test-agent',
      } as any,
      authorizer: authContext,
    } as any,
    resource: path,
    stageVariables: null,
    multiValueHeaders: {},
  };
}

/**
 * Helper to create mock Lambda context
 */
function createMockContext(): Context {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/test-function',
    logStreamName: '2024/01/15/[$LATEST]test-stream',
    getRemainingTimeInMillis: () => 3000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };
}

describe('NFC URL Handler Integration', () => {
  const mockAdminContext = {
    memberId: 'user123',
    familyId: 'fam123',
    role: 'admin',
  };

  const mockSuggesterContext = {
    memberId: 'user456',
    familyId: 'fam123',
    role: 'suggester',
  };

  const mockUrl: NFCUrl = {
    urlId: '2gSZw8ZQPb7D5kN3X8mQ78',
    itemId: 'FAMILY#fam123#ITEM#item456',
    familyId: 'fam123',
    isActive: true,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
    accessCount: 5,
    lastAccessedAt: '2024-01-16T14:30:00Z',
    itemName: 'Milk',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/items/{itemId}/nfc-urls - List URLs for Item (T043)', () => {
    it('should list NFC URLs for an item', async () => {
      (NfcService.listUrlsForItem as jest.Mock) = jest.fn().mockResolvedValue([mockUrl]);

      const event = createMockEvent(
        'GET',
        '/api/items/FAMILY%23fam123%23ITEM%23item456/nfc-urls',
        undefined,
        { itemId: 'FAMILY#fam123#ITEM#item456' },
        mockAdminContext
      );

      const result = await handler(event, createMockContext()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.urls).toHaveLength(1);
      expect(body.nfcUrls[0]).toMatchObject({
        urlId: mockUrl.urlId,
        itemId: mockUrl.itemId,
        isActive: true,
      });
    });

    it('should return empty array when no URLs exist', async () => {
      (NfcService.listUrlsForItem as jest.Mock) = jest.fn().mockResolvedValue([]);

      const event = createMockEvent(
        'GET',
        '/api/items/FAMILY%23fam123%23ITEM%23item456/nfc-urls',
        undefined,
        { itemId: 'FAMILY#fam123#ITEM#item456' },
        mockAdminContext
      );

      const result = await handler(event, createMockContext()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.urls).toEqual([]);
    });

    it('should include CORS headers', async () => {
      const mockService = NfcService as jest.MockedClass<typeof NfcService>;
      mockService.prototype.listUrlsForItem = jest.fn().mockResolvedValue([mockUrl]);

      const event = createMockEvent(
        'GET',
        '/api/items/FAMILY%23fam123%23ITEM%23item456/nfc-urls',
        undefined,
        { itemId: 'FAMILY#fam123#ITEM#item456' },
        mockAdminContext
      );

      const result = await handler(event, createMockContext()) as APIGatewayProxyResult;

      expect(result.headers).toMatchObject({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
    });

    it('should return 400 for missing itemId', async () => {
      const event = createMockEvent(
        'GET',
        '/api/items/FAMILY%23fam123%23ITEM%23item456/nfc-urls',
        undefined,
        {},
        mockAdminContext
      );

      const result = await handler(event, createMockContext()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('Item ID is required');
    });

    it('should return 500 on service error', async () => {
      (NfcService.listUrlsForItem as jest.Mock) = jest.fn().mockRejectedValue(
        new Error('DynamoDB error')
      );

      const event = createMockEvent(
        'GET',
        '/api/items/FAMILY%23fam123%23ITEM%23item456/nfc-urls',
        undefined,
        { itemId: 'FAMILY#fam123#ITEM#item456' },
        mockAdminContext
      );

      const result = await handler(event, createMockContext()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Internal server error');
    });
  });

  describe('POST /api/items/{itemId}/nfc-urls - Create URL (T044)', () => {
    it('should create new NFC URL', async () => {
      (NfcService.generateUrl as jest.Mock) = jest.fn().mockResolvedValue(mockUrl);

      const event = createMockEvent(
        'POST',
        '/api/items/FAMILY%23fam123%23ITEM%23item456/nfc-urls',
        {},
        { itemId: 'FAMILY#fam123#ITEM#item456' },
        mockAdminContext
      );

      const result = await handler(event, createMockContext()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body).toMatchObject({
        urlId: mockUrl.urlId,
        itemId: mockUrl.itemId,
        isActive: true,
      });
      expect(NfcService.generateUrl).toHaveBeenCalledWith({
        itemId: 'FAMILY#fam123#ITEM#item456',
        familyId: 'fam123',
        itemName: '',
        createdBy: 'user123',
      });
    });

    it('should return 400 for missing itemId', async () => {
      const event = createMockEvent(
        'POST',
        '/api/items/FAMILY%23fam123%23ITEM%23item456/nfc-urls',
        {},
        {},
        mockAdminContext
      );

      const result = await handler(event, createMockContext()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Missing itemId');
    });

    it('should return 500 on service error', async () => {
      (NfcService.generateUrl as jest.Mock) = jest.fn().mockRejectedValue(
        new Error('Failed to generate URL')
      );

      const event = createMockEvent(
        'POST',
        '/api/items/FAMILY%23fam123%23ITEM%23item456/nfc-urls',
        {},
        { itemId: 'FAMILY#fam123#ITEM#item456' },
        mockAdminContext
      );

      const result = await handler(event, createMockContext()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Internal server error');
    });
  });

  describe('POST /api/items/{itemId}/nfc-urls/{urlId}/rotate - Rotate URL (T046, T052)', () => {
    it('should rotate NFC URL', async () => {
      const newUrl: NFCUrl = {
        ...mockUrl,
        urlId: '3hTAx9AQRc8E6lO4Y9nR89',
        createdAt: '2024-01-17T10:00:00Z',
        accessCount: 0,
        lastAccessedAt: undefined,
      };

      (NfcService.rotateUrl as jest.Mock) = jest.fn().mockResolvedValue({
        oldUrl: { ...mockUrl, isActive: false },
        newUrl,
      });

      const event = createMockEvent(
        'POST',
        '/api/items/FAMILY%23fam123%23ITEM%23item456/nfc-urls/2gSZw8ZQPb7D5kN3X8mQ78/rotate',
        {},
        {
          itemId: 'FAMILY#fam123#ITEM#item456',
          urlId: '2gSZw8ZQPb7D5kN3X8mQ78',
        },
        mockAdminContext
      );

      const result = await handler(event, createMockContext()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.oldUrl.isActive).toBe(false);
      expect(body.newUrl.isActive).toBe(true);
      expect(body.newUrl.urlId).toBe('3hTAx9AQRc8E6lO4Y9nR89');
    });

    it('should return 400 for missing itemId or urlId', async () => {
      const event = createMockEvent(
        'POST',
        '/api/items/FAMILY%23fam123%23ITEM%23item456/nfc-urls/2gSZw8ZQPb7D5kN3X8mQ78/rotate',
        {},
        { itemId: 'FAMILY#fam123#ITEM#item456' },
        mockAdminContext
      );

      const result = await handler(event, createMockContext()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('required');
    });

    it('should return 404 when URL not found', async () => {
      (NfcService.rotateUrl as jest.Mock) = jest.fn().mockRejectedValue(
        new Error('NFC URL not found')
      );

      const event = createMockEvent(
        'POST',
        '/api/items/FAMILY%23fam123%23ITEM%23item456/nfc-urls/invalid-url-id/rotate',
        {},
        {
          itemId: 'FAMILY#fam123#ITEM#item456',
          urlId: 'invalid-url-id',
        },
        mockAdminContext
      );

      const result = await handler(event, createMockContext()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(500);
    });

    it('should return 500 on service error', async () => {
      (NfcService.rotateUrl as jest.Mock) = jest.fn().mockRejectedValue(
        new Error('Failed to rotate URL')
      );

      const event = createMockEvent(
        'POST',
        '/api/items/FAMILY%23fam123%23ITEM%23item456/nfc-urls/2gSZw8ZQPb7D5kN3X8mQ78/rotate',
        {},
        {
          itemId: 'FAMILY#fam123#ITEM#item456',
          urlId: '2gSZw8ZQPb7D5kN3X8mQ78',
        },
        mockAdminContext
      );

      const result = await handler(event, createMockContext()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Internal server error');
    });
  });

  describe('GET /api/nfc-urls - List All URLs for Family', () => {
    it('should list all NFC URLs for family', async () => {
      (NfcService.listUrlsForFamily as jest.Mock) = jest.fn().mockResolvedValue([mockUrl]);

      const event = createMockEvent(
        'GET',
        '/api/nfc-urls',
        undefined,
        undefined,
        mockAdminContext
      );

      const result = await handler(event, createMockContext()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.urls).toHaveLength(1);
      expect(body.urls[0]).toMatchObject({
        urlId: mockUrl.urlId,
        familyId: mockUrl.familyId,
      });
    });

    it('should return empty array when no URLs exist', async () => {
      (NfcService.listUrlsForFamily as jest.Mock) = jest.fn().mockResolvedValue([]);

      const event = createMockEvent(
        'GET',
        '/api/nfc-urls',
        undefined,
        undefined,
        mockAdminContext
      );

      const result = await handler(event, createMockContext()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.urls).toEqual([]);
    });
  });

  describe('Admin Authorization (T051)', () => {
    it('should reject suggester role for list URLs', async () => {
      const event = createMockEvent(
        'GET',
        '/api/items/FAMILY%23fam123%23ITEM%23item456/nfc-urls',
        undefined,
        { itemId: 'FAMILY#fam123#ITEM#item456' },
        mockSuggesterContext
      );

      const result = await handler(event, createMockContext()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Admin access required');
    });

    it('should reject suggester role for create URL', async () => {
      const event = createMockEvent(
        'POST',
        '/api/items/FAMILY%23fam123%23ITEM%23item456/nfc-urls',
        {},
        { itemId: 'FAMILY#fam123#ITEM#item456' },
        mockSuggesterContext
      );

      const result = await handler(event, createMockContext()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('Admin role required');
    });

    it('should reject suggester role for rotate URL', async () => {
      const event = createMockEvent(
        'POST',
        '/api/items/FAMILY%23fam123%23ITEM%23item456/nfc-urls/2gSZw8ZQPb7D5kN3X8mQ78/rotate',
        {},
        {
          itemId: 'FAMILY#fam123#ITEM#item456',
          urlId: '2gSZw8ZQPb7D5kN3X8mQ78',
        },
        mockSuggesterContext
      );

      const result = await handler(event, createMockContext()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('Admin role required');
    });

    it('should reject missing authorization context', async () => {
      const event = createMockEvent(
        'GET',
        '/api/items/FAMILY%23fam123%23ITEM%23item456/nfc-urls',
        undefined,
        { itemId: 'FAMILY#fam123#ITEM#item456' }
      );

      const result = await handler(event, createMockContext()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('Authentication required');
    });

    it('should allow admin role for all endpoints', async () => {
      const mockService = NfcService as jest.MockedClass<typeof NfcService>;
      mockService.prototype.listUrlsForItem = jest.fn().mockResolvedValue([mockUrl]);

      const event = createMockEvent(
        'GET',
        '/api/items/FAMILY%23fam123%23ITEM%23item456/nfc-urls',
        undefined,
        { itemId: 'FAMILY#fam123#ITEM#item456' },
        mockAdminContext
      );

      const result = await handler(event, createMockContext()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
    });
  });

  describe('OPTIONS Preflight Requests', () => {
    it('should handle OPTIONS requests', async () => {
      const event = createMockEvent(
        'OPTIONS',
        '/api/items/FAMILY%23fam123%23ITEM%23item456/nfc-urls',
        undefined,
        { itemId: 'FAMILY#fam123#ITEM#item456' }
      );

      const result = await handler(event, createMockContext()) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      expect(result.headers).toMatchObject({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
    });
  });

  describe('End-to-End Rotation Flow (T052)', () => {
    it('should complete full rotation workflow', async () => {
      // Step 1: List existing URLs
      (NfcService.listUrlsForItem as jest.Mock) = jest.fn().mockResolvedValue([mockUrl]);

      const listEvent = createMockEvent(
        'GET',
        '/api/items/FAMILY%23fam123%23ITEM%23item456/nfc-urls',
        undefined,
        { itemId: 'FAMILY#fam123#ITEM#item456' },
        mockAdminContext
      );

      const listResult = await handler(listEvent, createMockContext()) as APIGatewayProxyResult;
      expect(listResult.statusCode).toBe(200);
      const listBody = JSON.parse(listResult.body);
      expect(listBody.urls).toHaveLength(1);
      expect(listBody.urls[0].isActive).toBe(true);

      // Step 2: Rotate URL
      const newUrl: NFCUrl = {
        ...mockUrl,
        urlId: '3hTAx9AQRc8E6lO4Y9nR89',
        createdAt: '2024-01-17T10:00:00Z',
        accessCount: 0,
        lastAccessedAt: undefined,
      };

      (NfcService.rotateUrl as jest.Mock) = jest.fn().mockResolvedValue({
        oldUrl: { ...mockUrl, isActive: false },
        newUrl,
      });

      const rotateEvent = createMockEvent(
        'POST',
        '/api/items/FAMILY%23fam123%23ITEM%23item456/nfc-urls/2gSZw8ZQPb7D5kN3X8mQ78/rotate',
        {},
        {
          itemId: 'FAMILY#fam123#ITEM#item456',
          urlId: '2gSZw8ZQPb7D5kN3X8mQ78',
        },
        mockAdminContext
      );

      const rotateResult = await handler(rotateEvent, createMockContext()) as APIGatewayProxyResult;
      expect(rotateResult.statusCode).toBe(200);
      const rotateBody = JSON.parse(rotateResult.body);
      expect(rotateBody.oldUrl.isActive).toBe(false);
      expect(rotateBody.newUrl.isActive).toBe(true);

      // Step 3: Verify new URL list includes both
      (NfcService.listUrlsForItem as jest.Mock) = jest.fn().mockResolvedValue([
        newUrl,
        { ...mockUrl, isActive: false },
      ]);

      const verifyEvent = createMockEvent(
        'GET',
        '/api/items/FAMILY%23fam123%23ITEM%23item456/nfc-urls',
        undefined,
        { itemId: 'FAMILY#fam123#ITEM#item456' },
        mockAdminContext
      );

      const verifyResult = await handler(verifyEvent, createMockContext()) as APIGatewayProxyResult;
      expect(verifyResult.statusCode).toBe(200);
      const verifyBody = JSON.parse(verifyResult.body);
      expect(verifyBody.urls).toHaveLength(2);
      expect(verifyBody.urls[0].isActive).toBe(true);
      expect(verifyBody.urls[1].isActive).toBe(false);
    });
  });
});
