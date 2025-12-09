import { APIGatewayProxyHandler } from 'aws-lambda';
import { InventoryService } from '../services/inventoryService';
import { adjustQuantityRequestSchema } from '../types/schemas';
import { 
  successResponse, 
  handleError, 
  parseJsonBody,
  getPathParameter
} from '../lib/response';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../lib/logger';

/**
 * PATCH /families/{familyId}/inventory/{itemId}/quantity
 * Adjust inventory item quantity (admin only)
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('adjustInventoryQuantity', event, context.awsRequestId);

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

    // Only admins can adjust inventory quantities
    if (userRole !== 'admin') {
      throw new Error('Only admins can adjust inventory quantities');
    }

    // Parse and validate request body
    const body = parseJsonBody(event.body);
    const validatedData = adjustQuantityRequestSchema.parse(body);

    // Adjust inventory quantity
    const item = await InventoryService.adjustQuantity(
      familyId, 
      itemId, 
      validatedData.adjustment, 
      memberId
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
