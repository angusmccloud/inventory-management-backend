import { APIGatewayProxyHandler } from 'aws-lambda';
import { InventoryService } from '../services/inventoryService.js';
import { 
  successResponse, 
  handleError, 
  getPathParameter,
  notFoundResponse
} from '../lib/response.js';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../lib/logger.js';
import { getUserContext, requireFamilyAccess } from '../lib/auth.js';

/**
 * GET /families/{familyId}/inventory/{itemId}
 * Get a specific inventory item
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('getInventoryItem', event, context.awsRequestId);

  try {
    // Get authenticated user context (supports local development)
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const itemId = getPathParameter(event.pathParameters, 'itemId');

    // Ensure user can only access their own family
    await requireFamilyAccess(userContext, familyId);

    // Get inventory item
    const item = await InventoryService.getItem(familyId, itemId);

    if (!item) {
      return notFoundResponse('Inventory item');
    }

    logger.info('Inventory item retrieved successfully', { familyId, itemId });

    logLambdaCompletion('getInventoryItem', Date.now() - startTime, context.awsRequestId);

    return successResponse(item);
  } catch (error) {
    logger.error('Failed to get inventory item', error as Error);
    return handleError(error);
  }
};
