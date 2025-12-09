import { APIGatewayProxyHandler } from 'aws-lambda';
import { InventoryService } from '../services/inventoryService';
import { 
  successResponse, 
  handleError, 
  getPathParameter
} from '../lib/response';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../lib/logger';

/**
 * POST /families/{familyId}/inventory/{itemId}/archive
 * Archive an inventory item (admin only)
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('archiveInventoryItem', event, context.awsRequestId);

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

    // Only admins can archive inventory items
    if (userRole !== 'admin') {
      throw new Error('Only admins can archive inventory items');
    }

    // Archive inventory item
    const item = await InventoryService.archiveItem(familyId, itemId, memberId);

    logger.info('Inventory item archived successfully', { familyId, itemId });

    logLambdaCompletion('archiveInventoryItem', Date.now() - startTime, context.awsRequestId);

    return successResponse(item, 'Inventory item archived successfully');
  } catch (error) {
    logger.error('Failed to archive inventory item', error as Error);
    return handleError(error);
  }
};
