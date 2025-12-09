import { APIGatewayProxyHandler } from 'aws-lambda';
import { InventoryService } from '../services/inventoryService.js';
import { 
  successResponse, 
  handleError, 
  getPathParameter
} from '../lib/response.js';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../lib/logger.js';
import { getUserContext, requireFamilyAccess, requireAdmin } from '../lib/auth.js';

/**
 * POST /families/{familyId}/inventory/{itemId}/archive
 * Archive an inventory item (admin only)
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('archiveInventoryItem', event, context.awsRequestId);

  try {
    // Get authenticated user context (supports local development)
    const userContext = getUserContext(event, logger, true);
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const itemId = getPathParameter(event.pathParameters, 'itemId');

    // Ensure user can only access their own family
    requireFamilyAccess(userContext, familyId);

    // Only admins can archive inventory items
    requireAdmin(userContext);

    // Archive inventory item
    const item = await InventoryService.archiveItem(familyId, itemId, userContext.memberId);

    logger.info('Inventory item archived successfully', { familyId, itemId });

    logLambdaCompletion('archiveInventoryItem', Date.now() - startTime, context.awsRequestId);

    return successResponse(item, 'Inventory item archived successfully');
  } catch (error) {
    logger.error('Failed to archive inventory item', error as Error);
    return handleError(error);
  }
};
