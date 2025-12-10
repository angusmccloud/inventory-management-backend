import { APIGatewayProxyHandler } from 'aws-lambda';
import { InventoryService } from '../services/inventoryService.js';
import { adjustQuantityRequestSchema } from '../types/schemas.js';
import { 
  successResponse, 
  handleError, 
  parseJsonBody,
  getPathParameter
} from '../lib/response.js';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../lib/logger.js';
import { getUserContext, requireFamilyAccess, requireAdmin } from '../lib/auth.js';

/**
 * PATCH /families/{familyId}/inventory/{itemId}/quantity
 * Adjust inventory item quantity (admin only)
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('adjustInventoryQuantity', event, context.awsRequestId);

  try {
    // Get authenticated user context (supports local development)
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const itemId = getPathParameter(event.pathParameters, 'itemId');

    // Ensure user can only access their own family
    await requireFamilyAccess(userContext, familyId);

    // Only admins can adjust inventory quantities
    await requireAdmin(userContext, familyId);

    // Parse and validate request body
    const body = parseJsonBody(event.body);
    const validatedData = adjustQuantityRequestSchema.parse(body);

    // Adjust inventory quantity
    const item = await InventoryService.adjustQuantity(
      familyId, 
      itemId, 
      validatedData.adjustment, 
      userContext.memberId
    );

    logger.info('Inventory quantity adjusted successfully', { 
      familyId, 
      itemId, 
      adjustment: validatedData.adjustment,
      newQuantity: item.quantity
    });

    logLambdaCompletion('adjustInventoryQuantity', Date.now() - startTime, context.awsRequestId);

    return successResponse(item, 'Inventory quantity adjusted successfully');
  } catch (error) {
    logger.error('Failed to adjust inventory quantity', error as Error);
    return handleError(error);
  }
};
