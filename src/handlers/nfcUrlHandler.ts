/**
 * NFC URL Management Handler
 * 
 * @description Authenticated Lambda handler for admin NFC URL CRUD operations.
 * Handles:
 * - GET /api/items/{itemId}/nfc-urls - List URLs for item
 * - POST /api/items/{itemId}/nfc-urls - Create new URL
 * - POST /api/items/{itemId}/nfc-urls/{urlId}/rotate - Rotate URL
 * - GET /api/nfc-urls - List all URLs for family
 * 
 * Authorization: Admin role required
 * 
 * @see specs/006-api-integration/contracts/nfc-url-management-api.yaml
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { NfcService } from '../services/nfcService';
import { logger } from '../lib/logger';
import { getUserContext, requireAdmin, UserContext } from '../lib/auth';
import { InventoryItemModel } from '../models/inventory';
import { MemberModel } from '../models/member';
import { 
  uuidSchema,
  urlIdSchema,
  safeValidateRequest 
} from '../lib/validation/nfcSchemas';

/**
 * CORS headers
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

/**
 * Main handler
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    logger.info('NFC URL management request received', {
      path: event.path,
      resource: event.resource,
      method: event.httpMethod,
      pathParameters: event.pathParameters,
    });
  } catch (logError) {
    console.error('Logger initialization failed:', logError);
  }

  try {
    // Handle OPTIONS preflight
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: '',
      };
    }

    // Get user context from JWT token
    const userContext = getUserContext(event, logger);

    // Route to appropriate handler
    const path = event.resource;
    const method = event.httpMethod;

    if (path === '/api/items/{itemId}/nfc-urls' && method === 'GET') {
      return await listUrlsForItem(event, userContext);
    } else if (path === '/api/items/{itemId}/nfc-urls' && method === 'POST') {
      return await createUrl(event, userContext);
    } else if (path === '/api/items/{itemId}/nfc-urls/{urlId}/rotate' && method === 'POST') {
      return await rotateUrl(event, userContext);
    } else if (path === '/api/nfc-urls' && method === 'GET') {
      return await listUrlsForFamily(event, userContext);
    } else {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: {
            code: 'NOT_FOUND',
            message: 'Endpoint not found',
          },
        }),
      };
    }
  } catch (error) {
    const err = error as Error;
    console.error('NFC URL management handler error:', {
      message: err.message,
      stack: err.stack,
      name: err.name,
    });
    
    try {
      logger.error('NFC URL management handler error', err, {
        path: event.path,
        resource: event.resource,
        method: event.httpMethod,
      });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }

    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
          details: process.env['NODE_ENV'] === 'dev' ? err.message : undefined,
        },
      }),
    };
  }
};

/**
 * GET /api/items/{itemId}/nfc-urls
 * List all NFC URLs for an inventory item
 */
async function listUrlsForItem(
  event: APIGatewayProxyEvent,
  userContext: UserContext
): Promise<APIGatewayProxyResult> {
  const itemId = event.pathParameters?.['itemId'];
  if (!itemId) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: { code: 'MISSING_ITEM_ID', message: 'Item ID is required' },
      }),
    };
  }

  // Validate UUID format
  const validation = safeValidateRequest(uuidSchema, itemId);
  if (!validation.success) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: { code: 'INVALID_ITEM_ID', message: 'Invalid item ID format' },
      }),
    };
  }

  try {
    // Get user's family membership to find their familyId
    const member = await MemberModel.getByMemberId(userContext.memberId);
    
    if (!member) {
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: {
            code: 'FORBIDDEN',
            message: 'User must be member of a family',
          },
        }),
      };
    }

    // Get item to verify it exists in the user's family
    const item = await InventoryItemModel.getById(member.familyId, itemId);
    if (!item) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: { code: 'ITEM_NOT_FOUND', message: 'Inventory item not found' },
        }),
      };
    }

    // Verify user has admin role
    await requireAdmin(userContext, member.familyId);

    // List URLs for the item
    const urls = await NfcService.listUrlsForItem(member.familyId, itemId);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        data: {
          urls,
          totalCount: urls.length,
        },
      }),
    };
  } catch (error) {
    logger.error('Failed to list URLs for item', error as Error, { itemId });
    
    if ((error as Error).message.includes('not found')) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: { code: 'ITEM_NOT_FOUND', message: 'Inventory item not found' },
        }),
      };
    }

    throw error;
  }
}

/**
 * POST /api/items/{itemId}/nfc-urls
 * Create a new NFC URL for an inventory item
 */
async function createUrl(
  event: APIGatewayProxyEvent,
  userContext: UserContext
): Promise<APIGatewayProxyResult> {
  const itemId = event.pathParameters?.['itemId'];
  if (!itemId) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: { code: 'MISSING_ITEM_ID', message: 'Item ID is required' },
      }),
    };
  }

  // Validate UUID format
  const validation = safeValidateRequest(uuidSchema, itemId);
  if (!validation.success) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: { code: 'INVALID_ITEM_ID', message: 'Invalid item ID format' },
      }),
    };
  }

  try {
    // Get user's family membership to find their familyId
    const member = await MemberModel.getByMemberId(userContext.memberId);
    
    if (!member) {
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: {
            code: 'FORBIDDEN',
            message: 'User must be member of a family',
          },
        }),
      };
    }

    // Get item to verify it exists in the user's family
    const item = await InventoryItemModel.getById(member.familyId, itemId);
    if (!item) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: { code: 'ITEM_NOT_FOUND', message: 'Inventory item not found' },
        }),
      };
    }

    // Verify user has admin role
    await requireAdmin(userContext, member.familyId);

    // Generate NFC URL
    const nfcUrl = await NfcService.generateUrl({
      itemId,
      familyId: member.familyId,
      itemName: '', // Will be fetched from item
      createdBy: userContext.memberId,
    });

    logger.info('NFC URL created', {
      urlId: nfcUrl.urlId,
      itemId,
      createdBy: userContext.memberId,
    });

    return {
      statusCode: 201,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        data: nfcUrl,
      }),
    };
  } catch (error) {
    logger.error('Failed to create NFC URL', error as Error, { itemId });
    
    if ((error as Error).message.includes('not found')) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: { code: 'ITEM_NOT_FOUND', message: 'Inventory item not found' },
        }),
      };
    }

    if ((error as Error).message.includes('archived')) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: { code: 'ITEM_ARCHIVED', message: 'Cannot create URL for archived item' },
        }),
      };
    }

    throw error;
  }
}

/**
 * POST /api/items/{itemId}/nfc-urls/{urlId}/rotate
 * Rotate (deactivate) an NFC URL and create a new one
 */
async function rotateUrl(
  event: APIGatewayProxyEvent,
  userContext: UserContext
): Promise<APIGatewayProxyResult> {
  const itemId = event.pathParameters?.['itemId'];
  const urlId = event.pathParameters?.['urlId'];

  if (!itemId || !urlId) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: { code: 'MISSING_PARAMETERS', message: 'Item ID and URL ID are required' },
      }),
    };
  }

  // Validate formats
  const itemIdValidation = safeValidateRequest(uuidSchema, itemId);
  const urlIdValidation = safeValidateRequest(urlIdSchema, urlId);

  if (!itemIdValidation.success || !urlIdValidation.success) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: { code: 'INVALID_PARAMETERS', message: 'Invalid parameter format' },
      }),
    };
  }

  try {
    // Get user's family membership to find their familyId
    const member = await MemberModel.getByMemberId(userContext.memberId);
    
    if (!member) {
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: {
            code: 'FORBIDDEN',
            message: 'User must be member of a family',
          },
        }),
      };
    }

    // Get item to verify it exists in the user's family
    const item = await InventoryItemModel.getById(member.familyId, itemId);
    if (!item) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: { code: 'ITEM_NOT_FOUND', message: 'Inventory item not found' },
        }),
      };
    }

    // Verify user has admin role
    await requireAdmin(userContext, member.familyId);

    // Rotate the URL
    const newUrl = await NfcService.rotateUrl({
      urlId,
      familyId: member.familyId,
      rotatedBy: userContext.memberId,
    });

    logger.info('NFC URL rotated', {
      oldUrlId: urlId,
      newUrlId: newUrl.urlId,
      rotatedBy: userContext.memberId,
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        data: {
          message: 'URL rotated successfully',
          oldUrlId: urlId,
          newUrl,
        },
      }),
    };
  } catch (error) {
    logger.error('Failed to rotate NFC URL', error as Error, { urlId });
    
    const errorMessage = (error as Error).message;
    
    if (errorMessage.includes('not found')) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: { code: 'URL_NOT_FOUND', message: 'NFC URL not found' },
        }),
      };
    }

    if (errorMessage.includes('Family ID mismatch')) {
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: { code: 'FORBIDDEN', message: 'URL does not belong to your family' },
        }),
      };
    }

    throw error;
  }
}

/**
 * GET /api/nfc-urls
 * List all NFC URLs for the family
 */
async function listUrlsForFamily(
  _event: APIGatewayProxyEvent,
  userContext: UserContext
): Promise<APIGatewayProxyResult> {
  try {
    // Get user's family membership to find their familyId
    const member = await MemberModel.getByMemberId(userContext.memberId);
    
    if (!member) {
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: {
            code: 'FORBIDDEN',
            message: 'User must be member of a family',
          },
        }),
      };
    }

    // Verify user has admin role for their family
    await requireAdmin(userContext, member.familyId);

    // List all URLs for the family
    const urls = await NfcService.listUrlsForFamily(member.familyId);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        data: {
          urls,
          totalCount: urls.length,
        },
      }),
    };
  } catch (error) {
    logger.error('Failed to list URLs for family', error as Error);
    throw error;
  }
}
