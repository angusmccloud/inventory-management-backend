import { APIGatewayProxyHandler } from 'aws-lambda';
import { InventoryItemModel } from '../models/inventory';
import { 
  handleError, 
  getPathParameter
} from '../lib/response';
import { createLambdaLogger, logLambdaInvocation } from '../lib/logger';

/**
 * DELETE /families/{familyId}/inventory/{itemId}
 * Delete an inventory item (admin only, hard delete for cleanup)
 * Note: Prefer archiving items over deleting them
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('deleteInventoryItem', event, context.awsRequestId);

  try {
    // Get authenticated user info from authorizer context
    const authorizer = event.requestContext.authorizer;
    if (!authorizer || !authorizer['familyId'] || !authorizer['role']) {
      throw new Error('Authentication required');
    }

    const userFamilyId = authorizer['familyId'] as string;
    const userRole = authorizer['role'] as string;
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const itemId = getPathParameter(event.pathParameters, 'itemId');

    // Ensure user can only access their own family
    if (familyId !== userFamilyId) {
      throw new Error('Access denied to this family');
    }

    // Only admins can delete inventory items
    if (userRole !== 'admin') {
      throw new Error('Only admins can delete inventory items');
    }

    // Hard delete - get the item first to construct proper keys
    const item = await InventoryItemModel.getById(familyId, itemId);
    if (!item) {
      throw new Error('Item not found');
    }

    // In production, you might want to use the model's delete method
    // For now, we'll throw an error suggesting to use archive instead
    throw new Error('Hard delete not implemented. Please use archive endpoint instead.');

    // logger.info('Inventory item deleted successfully', { familyId, itemId });

    // logLambdaCompletion('deleteInventoryItem', Date.now() - startTime, context.awsRequestId);

    // return noContentResponse();
  } catch (error) {
    logger.error('Failed to delete inventory item', error as Error);
    return handleError(error);
  }
};
