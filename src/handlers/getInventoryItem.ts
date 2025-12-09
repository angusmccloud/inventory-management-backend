import { APIGatewayProxyHandler } from 'aws-lambda';
import { InventoryService } from '../services/inventoryService';
import { 
  successResponse, 
  handleError, 
  getPathParameter,
  notFoundResponse
} from '../lib/response';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../lib/logger';

/**
 * GET /families/{familyId}/inventory/{itemId}
 * Get a specific inventory item
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('getInventoryItem', event, context.awsRequestId);

  try {
    // Get authenticated user info from authorizer context
    const authorizer = event.requestContext.authorizer;
    if (!authorizer || !authorizer['familyId']) {
      throw new Error('Authentication required');
    }

    const userFamilyId = authorizer['familyId'] as string;
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const itemId = getPathParameter(event.pathParameters, 'itemId');

    // Ensure user can only access their own family
    if (familyId !== userFamilyId) {
      throw new Error('Access denied to this family');
    }

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
