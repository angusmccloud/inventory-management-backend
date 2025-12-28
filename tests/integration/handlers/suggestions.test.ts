/**
 * Integration Tests for Suggestion Handlers
 * 
 * Tests API endpoints for suggestion operations including creation,
 * listing, retrieval, approval, and rejection.
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler as createHandler } from '../../../src/handlers/suggestions/create-suggestion';
import { handler as listHandler } from '../../../src/handlers/suggestions/list-suggestions';
import { handler as getHandler } from '../../../src/handlers/suggestions/get-suggestion';
import { handler as approveHandler } from '../../../src/handlers/suggestions/approve-suggestion';
import { handler as rejectHandler } from '../../../src/handlers/suggestions/reject-suggestion';
import { SuggestionService } from '../../../src/services/suggestions';

// Mock the service layer
jest.mock('../../../src/services/suggestions');

describe('Suggestion Handlers Integration Tests', () => {
  const familyId = 'test-family-id';
  const suggestionId = 'test-suggestion-id';
  const itemId = 'test-item-id';

  const baseEvent: Partial<APIGatewayProxyEvent> = {
    headers: {},
    requestContext: {
      authorizer: {
        claims: {
          'custom:familyId': familyId,
          'custom:memberId': 'member-id',
          'custom:role': 'suggester',
          'custom:userName': 'Test User',
        },
      },
    } as any,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /suggestions (create)', () => {
    it('should create add_to_shopping suggestion successfully', async () => {
      const event = {
        ...baseEvent,
        pathParameters: { familyId },
        body: JSON.stringify({
          type: 'add_to_shopping',
          itemId,
          notes: 'Running low',
        }),
      } as APIGatewayProxyEvent;

      const mockSuggestion = {
        suggestionId: 'new-suggestion-id',
        familyId,
        suggestedBy: 'member-id',
        suggestedByName: 'Test User',
        type: 'add_to_shopping',
        itemId,
        itemNameSnapshot: 'Test Item',
        status: 'pending',
        version: 1,
        notes: 'Running low',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      jest.spyOn(SuggestionService, 'createSuggestion').mockResolvedValue(mockSuggestion);

      const response = await createHandler(event);

      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.body)).toEqual(mockSuggestion);
      expect(SuggestionService.createSuggestion).toHaveBeenCalledWith(
        familyId,
        'member-id',
        {
          type: 'add_to_shopping',
          itemId,
          notes: 'Running low',
        }
      );
    });

    it('should create create_item suggestion successfully', async () => {
      const event = {
        ...baseEvent,
        pathParameters: { familyId },
        body: JSON.stringify({
          type: 'create_item',
          proposedItemName: 'New Item',
          proposedQuantity: 10,
          proposedThreshold: 2,
          notes: 'We should stock this',
        }),
      } as APIGatewayProxyEvent;

      const mockSuggestion = {
        suggestionId: 'new-suggestion-id',
        familyId,
        suggestedBy: 'member-id',
        suggestedByName: 'Test User',
        type: 'create_item',
        proposedItemName: 'New Item',
        proposedQuantity: 10,
        proposedThreshold: 2,
        status: 'pending',
        version: 1,
        notes: 'We should stock this',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      jest.spyOn(SuggestionService, 'createSuggestion').mockResolvedValue(mockSuggestion);

      const response = await createHandler(event);

      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.body)).toEqual(mockSuggestion);
    });

    it('should return 403 when admin tries to create suggestion', async () => {
      const adminEvent = {
        ...baseEvent,
        requestContext: {
          authorizer: {
            claims: {
              'custom:familyId': familyId,
              'custom:memberId': 'admin-member-id',
              'custom:role': 'admin',
              'custom:userName': 'Admin User',
            },
          },
        } as any,
        pathParameters: { familyId },
        body: JSON.stringify({
          type: 'add_to_shopping',
          itemId,
        }),
      } as APIGatewayProxyEvent;

      jest
        .spyOn(SuggestionService, 'createSuggestion')
        .mockRejectedValue(new Error('Only suggester role members can create suggestions'));

      const response = await createHandler(adminEvent);

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body)).toMatchObject({
        error: expect.stringContaining('suggester role'),
      });
    });

    it('should return 404 when item not found', async () => {
      const event = {
        ...baseEvent,
        pathParameters: { familyId },
        body: JSON.stringify({
          type: 'add_to_shopping',
          itemId: 'nonexistent-item-id',
        }),
      } as APIGatewayProxyEvent;

      jest.spyOn(SuggestionService, 'createSuggestion').mockRejectedValue(new Error('Item not found'));

      const response = await createHandler(event);

      expect(response.statusCode).toBe(404);
    });

    it('should return 422 when duplicate item name for create_item', async () => {
      const event = {
        ...baseEvent,
        pathParameters: { familyId },
        body: JSON.stringify({
          type: 'create_item',
          proposedItemName: 'Duplicate Item',
          proposedQuantity: 10,
          proposedThreshold: 2,
        }),
      } as APIGatewayProxyEvent;

      jest.spyOn(SuggestionService, 'createSuggestion').mockRejectedValue(new Error('Item name already exists'));

      const response = await createHandler(event);

      expect(response.statusCode).toBe(422);
    });
  });

  describe('GET /suggestions (list with status filter)', () => {
    it('should list suggestions with status filter', async () => {
      const event = {
        ...baseEvent,
        pathParameters: { familyId },
        queryStringParameters: {
          status: 'pending',
          limit: '20',
        },
      } as APIGatewayProxyEvent;

      const mockSuggestions = [
        {
          suggestionId: 'suggestion-1',
          familyId,
          suggestedBy: 'member-id',
          suggestedByName: 'Test User',
          type: 'add_to_shopping',
          itemId,
          itemNameSnapshot: 'Test Item 1',
          status: 'pending',
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          suggestionId: 'suggestion-2',
          familyId,
          suggestedBy: 'member-id',
          suggestedByName: 'Test User',
          type: 'create_item',
          proposedItemName: 'New Item',
          proposedQuantity: 5,
          proposedThreshold: 1,
          status: 'pending',
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      jest.spyOn(SuggestionService, 'listSuggestions').mockResolvedValue({
        suggestions: mockSuggestions,
        nextToken: undefined,
      });

      const response = await listHandler(event);

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        suggestions: mockSuggestions,
        nextToken: undefined,
      });
      expect(SuggestionService.listSuggestions).toHaveBeenCalledWith(familyId, {
        status: 'pending',
        limit: 20,
        nextToken: undefined,
      });
    });

    it('should support pagination with nextToken', async () => {
      const event = {
        ...baseEvent,
        pathParameters: { familyId },
        queryStringParameters: {
          limit: '10',
          nextToken: 'encoded-next-token',
        },
      } as APIGatewayProxyEvent;

      jest.spyOn(SuggestionService, 'listSuggestions').mockResolvedValue({
        suggestions: [],
        nextToken: 'next-encoded-token',
      });

      const response = await listHandler(event);

      expect(response.statusCode).toBe(200);
      expect(SuggestionService.listSuggestions).toHaveBeenCalledWith(familyId, {
        status: undefined,
        limit: 10,
        nextToken: 'encoded-next-token',
      });
    });
  });

  describe('POST /suggestions/:id/approve', () => {
    const adminEvent = {
      ...baseEvent,
      requestContext: {
        authorizer: {
          claims: {
            'custom:familyId': familyId,
            'custom:memberId': 'admin-member-id',
            'custom:role': 'admin',
            'custom:userName': 'Admin User',
          },
        },
      } as any,
      pathParameters: { familyId, suggestionId },
    } as APIGatewayProxyEvent;

    it('should approve add_to_shopping suggestion successfully', async () => {
      const mockApprovedSuggestion = {
        suggestionId,
        familyId,
        suggestedBy: 'member-id',
        suggestedByName: 'Test User',
        type: 'add_to_shopping',
        itemId,
        itemNameSnapshot: 'Test Item',
        status: 'approved',
        version: 2,
        reviewedBy: 'admin-member-id',
        reviewedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      jest.spyOn(SuggestionService, 'approveSuggestion').mockResolvedValue(mockApprovedSuggestion);

      const response = await approveHandler(adminEvent);

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual(mockApprovedSuggestion);
      expect(SuggestionService.approveSuggestion).toHaveBeenCalledWith(
        familyId,
        suggestionId,
        'admin-member-id',
        'Admin User'
      );
    });

    it('should approve create_item suggestion successfully', async () => {
      const mockApprovedSuggestion = {
        suggestionId,
        familyId,
        suggestedBy: 'member-id',
        suggestedByName: 'Test User',
        type: 'create_item',
        proposedItemName: 'New Item',
        proposedQuantity: 10,
        proposedThreshold: 2,
        status: 'approved',
        version: 2,
        reviewedBy: 'admin-member-id',
        reviewedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      jest.spyOn(SuggestionService, 'approveSuggestion').mockResolvedValue(mockApprovedSuggestion);

      const response = await approveHandler(adminEvent);

      expect(response.statusCode).toBe(200);
    });

    it('should return 409 when duplicate item name on create_item approval', async () => {
      jest.spyOn(SuggestionService, 'approveSuggestion').mockRejectedValue(new Error('Item name already exists'));

      const response = await approveHandler(adminEvent);

      expect(response.statusCode).toBe(409);
      expect(JSON.parse(response.body)).toMatchObject({
        error: expect.stringContaining('already exists'),
      });
    });

    it('should return 422 when item has been deleted', async () => {
      jest
        .spyOn(SuggestionService, 'approveSuggestion')
        .mockRejectedValue(new Error('Referenced item has been deleted'));

      const response = await approveHandler(adminEvent);

      expect(response.statusCode).toBe(422);
    });

    it('should return 409 when concurrent approval (optimistic locking)', async () => {
      jest
        .spyOn(SuggestionService, 'approveSuggestion')
        .mockRejectedValue(new Error('Suggestion has already been reviewed'));

      const response = await approveHandler(adminEvent);

      expect(response.statusCode).toBe(409);
    });

    it('should return 403 when suggester tries to approve', async () => {
      const suggesterEvent = {
        ...baseEvent,
        pathParameters: { familyId, suggestionId },
      } as APIGatewayProxyEvent;

      // The handler should check role before calling service
      const response = await approveHandler(suggesterEvent);

      expect(response.statusCode).toBe(403);
    });
  });

  describe('POST /suggestions/:id/reject', () => {
    const adminEvent = {
      ...baseEvent,
      requestContext: {
        authorizer: {
          claims: {
            'custom:familyId': familyId,
            'custom:memberId': 'admin-member-id',
            'custom:role': 'admin',
            'custom:userName': 'Admin User',
          },
        },
      } as any,
      pathParameters: { familyId, suggestionId },
      body: JSON.stringify({
        rejectionNotes: 'Not needed at this time',
      }),
    } as APIGatewayProxyEvent;

    it('should reject suggestion successfully (admin)', async () => {
      const mockRejectedSuggestion = {
        suggestionId,
        familyId,
        suggestedBy: 'member-id',
        suggestedByName: 'Test User',
        type: 'add_to_shopping',
        itemId,
        itemNameSnapshot: 'Test Item',
        status: 'rejected',
        version: 2,
        reviewedBy: 'admin-member-id',
        reviewedAt: new Date().toISOString(),
        rejectionNotes: 'Not needed at this time',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      jest.spyOn(SuggestionService, 'rejectSuggestion').mockResolvedValue(mockRejectedSuggestion);

      const response = await rejectHandler(adminEvent);

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual(mockRejectedSuggestion);
      expect(SuggestionService.rejectSuggestion).toHaveBeenCalledWith(
        familyId,
        suggestionId,
        'admin-member-id',
        'Admin User',
        'Not needed at this time'
      );
    });

    it('should return 403 when suggester tries to reject', async () => {
      const suggesterEvent = {
        ...baseEvent,
        pathParameters: { familyId, suggestionId },
        body: JSON.stringify({}),
      } as APIGatewayProxyEvent;

      const response = await rejectHandler(suggesterEvent);

      expect(response.statusCode).toBe(403);
    });

    it('should return 409 when suggestion already reviewed', async () => {
      jest
        .spyOn(SuggestionService, 'rejectSuggestion')
        .mockRejectedValue(new Error('Suggestion has already been reviewed'));

      const response = await rejectHandler(adminEvent);

      expect(response.statusCode).toBe(409);
    });
  });

  describe('GET /suggestions/:id (get)', () => {
    it('should retrieve suggestion by ID successfully', async () => {
      const event = {
        ...baseEvent,
        pathParameters: { familyId, suggestionId },
      } as APIGatewayProxyEvent;

      const mockSuggestion = {
        suggestionId,
        familyId,
        suggestedBy: 'member-id',
        suggestedByName: 'Test User',
        type: 'add_to_shopping',
        itemId,
        itemNameSnapshot: 'Test Item',
        status: 'pending',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      jest.spyOn(SuggestionService, 'getSuggestion').mockResolvedValue(mockSuggestion);

      const response = await getHandler(event);

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual(mockSuggestion);
    });

    it('should return 404 when suggestion not found', async () => {
      const event = {
        ...baseEvent,
        pathParameters: { familyId, suggestionId: 'nonexistent-id' },
      } as APIGatewayProxyEvent;

      jest.spyOn(SuggestionService, 'getSuggestion').mockResolvedValue(null);

      const response = await getHandler(event);

      expect(response.statusCode).toBe(404);
    });
  });
});
