import { APIGatewayProxyHandler } from 'aws-lambda';
import { InventoryService } from '../services/inventoryService.js';
import { updateInventoryItemRequestSchema } from '../types/schemas.js';
import { 
  successResponse, 
  handleError, 
  parseJsonBody,
  getPathParameter
} from '../lib/response.js';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../lib/logger.js';
import { getUserContext, requireFamilyAccess, requireAdmin } from '../lib/auth.js';

/**
 * PUT /families/{familyId}/inventory/{itemId}
 * Update an inventory item (admin only)
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('updateInventoryItem', event, context.awsRequestId);

  try {
    // Get authenticated user context (supports local development)
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const itemId = getPathParameter(event.pathParameters, 'itemId');

    // Ensure user can only access their own family
    requireFamilyAccess(userContext, familyId);

    // Only admins can update inventory items
    await requireAdmin(userContext, familyId);

    // Parse and validate request body
    const body = parseJsonBody(event.body);
    const validatedData = updateInventoryItemRequestSchema.parse(body);

    // Update inventory item
    const item = await InventoryService.updateItem(familyId, itemId, validatedData, userContext.memberId);

    logger.info('Inventory item updated successfully', { familyId, itemId });

    logLambdaCompletion('updateInventoryItem', Date.now() - startTime, context.awsRequestId);

    return successResponse(item, 'Inventory item updated successfully');
  } catch (error) {
    logger.error('Failed to update inventory item', error as Error);
    return handleError(error);
  }
};
