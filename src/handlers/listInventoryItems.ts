import { APIGatewayProxyHandler } from 'aws-lambda';
import { InventoryService } from '../services/inventoryService.js';
import { 
  successResponse, 
  handleError, 
  getPathParameter,
  getQueryParameter
} from '../lib/response.js';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../lib/logger.js';
import { getUserContext, requireFamilyAccess } from '../lib/auth.js';

/**
 * GET /families/{familyId}/inventory
 * List all inventory items for a family
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('listInventoryItems', event, context.awsRequestId);

  try {
    // Get authenticated user context (supports local development)
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');

    // Ensure user can only access their own family
    await requireFamilyAccess(userContext, familyId);

    // Check if archived items should be included
    const includeArchived = getQueryParameter(event.queryStringParameters, 'includeArchived') === 'true';

    // List inventory items
    const items = await InventoryService.listItems(familyId, includeArchived);

    logger.info('Inventory items retrieved successfully', { 
      familyId, 
      count: items.length 
    });

    logLambdaCompletion('listInventoryItems', Date.now() - startTime, context.awsRequestId);

    // Return in the format expected by the frontend
    return successResponse({
      items,
      total: items.length
    });
  } catch (error) {
    logger.error('Failed to list inventory items', error as Error);
    return handleError(error);
  }
};
