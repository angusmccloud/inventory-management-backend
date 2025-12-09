import { APIGatewayProxyHandler } from 'aws-lambda';
import { InventoryService } from '../services/inventoryService';
import { updateInventoryItemRequestSchema } from '../types/schemas';
import { 
  successResponse, 
  handleError, 
  parseJsonBody,
  getPathParameter
} from '../lib/response';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../lib/logger';

/**
 * PUT /families/{familyId}/inventory/{itemId}
 * Update an inventory item (admin only)
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('updateInventoryItem', event, context.awsRequestId);

  try {
    // Get authenticated user info from authorizer context
    const authorizer = event.requestContext.authorizer;
    if (!authorizer || !authorizer['familyId'] || !authorizer['memberId'] || !authorizer['role']) {
      throw new Error('Authentication required');
    }

    const userFamilyId = authorizer['familyId'] as string;
    const memberId = authorizer['memberId'] as string;
    const userRole = authorizer['role'] as string;
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const itemId = getPathParameter(event.pathParameters, 'itemId');

    // Ensure user can only access their own family
    if (familyId !== userFamilyId) {
      throw new Error('Access denied to this family');
    }

    // Only admins can update inventory items
    if (userRole !== 'admin') {
      throw new Error('Only admins can update inventory items');
    }

    // Parse and validate request body
    const body = parseJsonBody(event.body);
    const validatedData = updateInventoryItemRequestSchema.parse(body);

    // Update inventory item
    const item = await InventoryService.updateItem(familyId, itemId, validatedData, memberId);

    logger.info('Inventory item updated successfully', { familyId, itemId });

    logLambdaCompletion('updateInventoryItem', Date.now() - startTime, context.awsRequestId);

    return successResponse(item, 'Inventory item updated successfully');
  } catch (error) {
    logger.error('Failed to update inventory item', error as Error);
    return handleError(error);
  }
};
