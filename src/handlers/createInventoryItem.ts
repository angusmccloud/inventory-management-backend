import { APIGatewayProxyHandler } from 'aws-lambda';
import { InventoryService } from '../services/inventoryService';
import { createInventoryItemRequestSchema } from '../types/schemas';
import { 
  createdResponse, 
  handleError, 
  parseJsonBody,
  getPathParameter
} from '../lib/response';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../lib/logger';

/**
 * POST /families/{familyId}/inventory
 * Create a new inventory item
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('createInventoryItem', event, context.awsRequestId);

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

    // Ensure user can only access their own family
    if (familyId !== userFamilyId) {
      throw new Error('Access denied to this family');
    }

    // Only admins can create inventory items
    if (userRole !== 'admin') {
      throw new Error('Only admins can create inventory items');
    }

    // Parse and validate request body
    const body = parseJsonBody(event.body);
    const validatedData = createInventoryItemRequestSchema.parse(body);

    // Create inventory item
    const item = await InventoryService.createItem({
      familyId,
      ...validatedData,
      createdBy: memberId,
    });

    logger.info('Inventory item created successfully', { 
      itemId: item.itemId, 
      familyId 
    });

    logLambdaCompletion('createInventoryItem', Date.now() - startTime, context.awsRequestId);

    return createdResponse(item, 'Inventory item created successfully');
  } catch (error) {
    logger.error('Failed to create inventory item', error as Error);
    return handleError(error);
  }
};
