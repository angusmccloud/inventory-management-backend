import { APIGatewayProxyHandler } from 'aws-lambda';
import { InventoryService } from '../services/inventoryService';
import { 
  successResponse, 
  handleError, 
  getPathParameter,
  getQueryParameter
} from '../lib/response';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../lib/logger';

/**
 * GET /families/{familyId}/inventory
 * List all inventory items for a family
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('listInventoryItems', event, context.awsRequestId);

  try {
    // Get authenticated user info from authorizer context
    const authorizer = event.requestContext.authorizer;
    if (!authorizer || !authorizer['familyId']) {
      throw new Error('Authentication required');
    }

    const userFamilyId = authorizer['familyId'] as string;
    const familyId = getPathParameter(event.pathParameters, 'familyId');

    // Ensure user can only access their own family
    if (familyId !== userFamilyId) {
      throw new Error('Access denied to this family');
    }

    // Check if archived items should be included
    const includeArchived = getQueryParameter(event.queryStringParameters, 'includeArchived') === 'true';

    // List inventory items
    const items = await InventoryService.listItems(familyId, includeArchived);

    logger.info('Inventory items retrieved successfully', { 
      familyId, 
      count: items.length 
    });

    logLambdaCompletion('listInventoryItems', Date.now() - startTime, context.awsRequestId);

    return successResponse(items);
  } catch (error) {
    logger.error('Failed to list inventory items', error as Error);
    return handleError(error);
  }
};
