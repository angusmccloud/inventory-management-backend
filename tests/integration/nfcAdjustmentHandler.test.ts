/**
 * Integration Tests: NFC Adjustment Handler
 * 
 * @description Integration tests for POST /api/adjust/{urlId} endpoint
 * Tests concurrent requests, minimum quantity enforcement, and error handling
 * 
 * @see specs/006-api-integration/tasks.md - T020, T021
 */

import { handler } from '../../src/handlers/nfcAdjustmentHandler';
import { NfcService } from '../../src/services/nfcService';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { AdjustmentResponse } from '../../src/types/nfcUrl';

// Mock NfcService
jest.mock('../../src/services/nfcService');

/**
 * Helper: Create mock API Gateway event
 */
function createMockEvent(urlId: string, delta: -1 | 1): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: `/api/adjust/${urlId}`,
    pathParameters: { urlId },
    body: JSON.stringify({ delta }),
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      path: `/api/adjust/${urlId}`,
      stage: 'test',
      requestId: 'test-request-id',
      requestTime: '01/Jan/2024:00:00:00 +0000',
      requestTimeEpoch: 1704067200000,
      identity: {
        sourceIp: '192.168.1.1',
        userAgent: 'test-agent',
        cognitoIdentityPoolId: null,
        cognitoIdentityId: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        accountId: null,
        caller: null,
        apiKey: null,
        apiKeyId: null,
        accessKey: null,
        principalOrgId: null,
        user: null,
        userArn: null,
        clientCert: null,
      },
      authorizer: null,
      resourceId: 'test-resource',
      resourcePath: '/api/adjust/{urlId}',
    },
    resource: '/api/adjust/{urlId}',
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
  } as APIGatewayProxyEvent;
}

describe('NFC Adjustment Handler - Integration Tests', () => {
  const mockUrlId = '2gSZw8ZQPb7D5kN3X8mQ78';
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Concurrent Requests (T020)', () => {
    it('should handle multiple concurrent adjustment requests atomically', async () => {
      // Mock successful adjustments with different final quantities
      const mockResponses: AdjustmentResponse[] = [
        {
          success: true,
          urlId: mockUrlId,
          itemId: 'FAMILY#fam123#ITEM#item456',
          itemName: 'Milk',
          newQuantity: 9,
          previousQuantity: 10,
          delta: -1,
          message: 'Adjustment successful',
        },
        {
          success: true,
          urlId: mockUrlId,
          itemId: 'FAMILY#fam123#ITEM#item456',
          itemName: 'Milk',
          newQuantity: 8,
          previousQuantity: 9,
          delta: -1,
          message: 'Adjustment successful',
        },
        {
          success: true,
          urlId: mockUrlId,
          itemId: 'FAMILY#fam123#ITEM#item456',
          itemName: 'Milk',
          newQuantity: 7,
          previousQuantity: 8,
          delta: -1,
          message: 'Adjustment successful',
        },
      ];

      let callCount = 0;
      (NfcService.adjustInventory as jest.Mock).mockImplementation(async () => {
        return mockResponses[callCount++];
      });

      // Send 3 concurrent requests
      const event1 = createMockEvent(mockUrlId, -1);
      const event2 = createMockEvent(mockUrlId, -1);
      const event3 = createMockEvent(mockUrlId, -1);

      const results = await Promise.all([
        handler(event1),
        handler(event2),
        handler(event3),
      ]);

      // All requests should succeed
      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body.success).toBe(true);
      });

      // Verify service was called 3 times
      expect(NfcService.adjustInventory).toHaveBeenCalledTimes(3);

      // Verify quantities are sequential (atomic updates)
      const quantities = results.map((r) => JSON.parse(r.body).newQuantity);
      expect(quantities).toEqual([9, 8, 7]);
    });

    it('should handle mixed success/failure in concurrent requests', async () => {
      const mockSuccessResponse: AdjustmentResponse = {
        success: true,
        urlId: mockUrlId,
        itemId: 'FAMILY#fam123#ITEM#item456',
        itemName: 'Milk',
        newQuantity: 9,
        previousQuantity: 10,
        delta: -1,
        message: 'Adjustment successful',
      };

      const mockFailureResponse: AdjustmentResponse = {
        success: false,
        errorCode: 'MIN_QUANTITY',
        errorMessage: 'Cannot reduce quantity below 0',
      };

      let callCount = 0;
      (NfcService.adjustInventory as jest.Mock).mockImplementation(async () => {
        // First two succeed, third fails
        return callCount++ < 2 ? mockSuccessResponse : mockFailureResponse;
      });

      const event1 = createMockEvent(mockUrlId, -1);
      const event2 = createMockEvent(mockUrlId, -1);
      const event3 = createMockEvent(mockUrlId, -1);

      const results = await Promise.all([
        handler(event1),
        handler(event2),
        handler(event3),
      ]);

      // First two should succeed
      expect(results[0].statusCode).toBe(200);
      expect(results[1].statusCode).toBe(200);

      // Third should fail
      expect(results[2].statusCode).toBe(400);
      const body3 = JSON.parse(results[2].body);
      expect(body3.success).toBe(false);
      expect(body3.error.code).toBe('MIN_QUANTITY');
    });

    it('should handle rapid successive adjustments (+1 then -1)', async () => {
      const mockIncrementResponse: AdjustmentResponse = {
        success: true,
        urlId: mockUrlId,
        itemId: 'FAMILY#fam123#ITEM#item456',
        itemName: 'Milk',
        newQuantity: 11,
        previousQuantity: 10,
        delta: 1,
        message: 'Adjustment successful',
      };

      const mockDecrementResponse: AdjustmentResponse = {
        success: true,
        urlId: mockUrlId,
        itemId: 'FAMILY#fam123#ITEM#item456',
        itemName: 'Milk',
        newQuantity: 10,
        previousQuantity: 11,
        delta: -1,
        message: 'Adjustment successful',
      };

      (NfcService.adjustInventory as jest.Mock)
        .mockResolvedValueOnce(mockIncrementResponse)
        .mockResolvedValueOnce(mockDecrementResponse);

      const incrementEvent = createMockEvent(mockUrlId, 1);
      const decrementEvent = createMockEvent(mockUrlId, -1);

      const results = await Promise.all([
        handler(incrementEvent),
        handler(decrementEvent),
      ]);

      expect(results).toHaveLength(2);
      results.forEach((result) => {
        expect(result.statusCode).toBe(200);
      });

      const body1 = JSON.parse(results[0].body);
      const body2 = JSON.parse(results[1].body);

      expect(body1.newQuantity).toBe(11);
      expect(body2.newQuantity).toBe(10);
    });
  });

  describe('Minimum Quantity Enforcement (T021)', () => {
    it('should reject adjustment when quantity would go below 0', async () => {
      const mockResponse: AdjustmentResponse = {
        success: false,
        errorCode: 'MIN_QUANTITY',
        errorMessage: 'Cannot reduce quantity below 0',
      };

      (NfcService.adjustInventory as jest.Mock).mockResolvedValue(mockResponse);

      const event = createMockEvent(mockUrlId, -1);
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('MIN_QUANTITY');
      expect(body.error.message).toContain('below 0');
    });

    it('should allow adjustment when quantity is exactly 1 and delta is -1', async () => {
      const mockResponse: AdjustmentResponse = {
        success: true,
        urlId: mockUrlId,
        itemId: 'FAMILY#fam123#ITEM#item456',
        itemName: 'Milk',
        newQuantity: 0,
        previousQuantity: 1,
        delta: -1,
        message: 'Adjustment successful',
      };

      (NfcService.adjustInventory as jest.Mock).mockResolvedValue(mockResponse);

      const event = createMockEvent(mockUrlId, -1);
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.newQuantity).toBe(0);
      expect(body.previousQuantity).toBe(1);
    });

    it('should reject adjustment when quantity is 0 and delta is -1', async () => {
      const mockResponse: AdjustmentResponse = {
        success: false,
        errorCode: 'MIN_QUANTITY',
        errorMessage: 'Cannot reduce quantity below 0',
      };

      (NfcService.adjustInventory as jest.Mock).mockResolvedValue(mockResponse);

      const event = createMockEvent(mockUrlId, -1);
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('MIN_QUANTITY');
    });

    it('should allow +1 adjustment at any quantity level', async () => {
      const mockResponse: AdjustmentResponse = {
        success: true,
        urlId: mockUrlId,
        itemId: 'FAMILY#fam123#ITEM#item456',
        itemName: 'Milk',
        newQuantity: 1,
        previousQuantity: 0,
        delta: 1,
        message: 'Adjustment successful',
      };

      (NfcService.adjustInventory as jest.Mock).mockResolvedValue(mockResponse);

      const event = createMockEvent(mockUrlId, 1);
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.newQuantity).toBe(1);
      expect(body.previousQuantity).toBe(0);
    });

    it('should handle multiple failed attempts to go below 0', async () => {
      const mockResponse: AdjustmentResponse = {
        success: false,
        errorCode: 'MIN_QUANTITY',
        errorMessage: 'Cannot reduce quantity below 0',
      };

      (NfcService.adjustInventory as jest.Mock).mockResolvedValue(mockResponse);

      const event1 = createMockEvent(mockUrlId, -1);
      const event2 = createMockEvent(mockUrlId, -1);
      const event3 = createMockEvent(mockUrlId, -1);

      const results = await Promise.all([
        handler(event1),
        handler(event2),
        handler(event3),
      ]);

      // All should fail with same error
      results.forEach((result) => {
        expect(result.statusCode).toBe(400);
        const body = JSON.parse(result.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('MIN_QUANTITY');
      });
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for invalid URL ID', async () => {
      const mockResponse: AdjustmentResponse = {
        success: false,
        errorCode: 'URL_INVALID',
        errorMessage: 'URL not found or inactive',
      };

      (NfcService.adjustInventory as jest.Mock).mockResolvedValue(mockResponse);

      const event = createMockEvent(mockUrlId, -1);
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('URL_INVALID');
    });

    it('should return 404 for inactive URL ID', async () => {
      const mockResponse: AdjustmentResponse = {
        success: false,
        errorCode: 'INACTIVE',
        errorMessage: 'URL has been deactivated',
      };

      (NfcService.adjustInventory as jest.Mock).mockResolvedValue(mockResponse);

      const event = createMockEvent(mockUrlId, -1);
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INACTIVE');
    });

    it('should return 404 for deleted item', async () => {
      const mockResponse: AdjustmentResponse = {
        success: false,
        errorCode: 'ITEM_NOT_FOUND',
        errorMessage: 'Item has been deleted',
      };

      (NfcService.adjustInventory as jest.Mock).mockResolvedValue(mockResponse);

      const event = createMockEvent(mockUrlId, -1);
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('ITEM_NOT_FOUND');
    });

    it('should return 400 for invalid delta value (not -1 or 1)', async () => {
      const event = createMockEvent(mockUrlId, -1);
      event.body = JSON.stringify({ delta: 5 }); // Invalid delta

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_REQUEST');
    });

    it('should return 400 for malformed URL ID format', async () => {
      const event = createMockEvent('invalid-format', -1);

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_URL_ID');
    });

    it('should return 400 for missing urlId parameter', async () => {
      const event = createMockEvent(mockUrlId, -1);
      event.pathParameters = {}; // Remove urlId

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('MISSING_URL_ID');
    });

    it('should handle OPTIONS preflight request', async () => {
      const event = createMockEvent(mockUrlId, -1);
      event.httpMethod = 'OPTIONS';

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(result.body).toBe('');
      expect(result.headers).toMatchObject({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      });
    });

    it('should return 500 for unexpected service errors', async () => {
      (NfcService.adjustInventory as jest.Mock).mockRejectedValue(
        new Error('Unexpected database error')
      );

      const event = createMockEvent(mockUrlId, -1);
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in successful response', async () => {
      const mockResponse: AdjustmentResponse = {
        success: true,
        urlId: mockUrlId,
        itemId: 'FAMILY#fam123#ITEM#item456',
        itemName: 'Milk',
        newQuantity: 9,
        previousQuantity: 10,
        delta: -1,
        message: 'Adjustment successful',
      };

      (NfcService.adjustInventory as jest.Mock).mockResolvedValue(mockResponse);

      const event = createMockEvent(mockUrlId, -1);
      const result = await handler(event);

      expect(result.headers).toMatchObject({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
    });

    it('should include CORS headers in error responses', async () => {
      const mockResponse: AdjustmentResponse = {
        success: false,
        errorCode: 'URL_INVALID',
        errorMessage: 'URL not found',
      };

      (NfcService.adjustInventory as jest.Mock).mockResolvedValue(mockResponse);

      const event = createMockEvent(mockUrlId, -1);
      const result = await handler(event);

      expect(result.headers).toMatchObject({
        'Access-Control-Allow-Origin': '*',
      });
    });
  });
});
