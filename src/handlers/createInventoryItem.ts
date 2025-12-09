import { APIGatewayProxyHandler } from 'aws-lambda';
import { InventoryService } from '../services/inventoryService.js';
import { createInventoryItemRequestSchema } from '../types/schemas.js';
import { 
  createdResponse, 
  handleError, 
  parseJsonBody,
  getPathParameter
} from '../lib/response.js';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../lib/logger.js';
import { getUserContext, requireFamilyAccess, requireAdmin } from '../lib/auth.js';

/**
 * POST /families/{familyId}/inventory
 * Create a new inventory item
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('createInventoryItem', event, context.awsRequestId);

  try {
    // Get authenticated user context (supports local development)
    const userContext = getUserContext(event, logger, true);
    const familyId = getPathParameter(event.pathParameters, 'familyId');

    // Ensure user can only access their own family
    requireFamilyAccess(userContext, familyId);

    // Only admins can create inventory items
    requireAdmin(userContext);

    // Parse and validate request body
    const body = parseJsonBody(event.body);
    const validatedData = createInventoryItemRequestSchema.parse(body);

    // Create inventory item
    const item = await InventoryService.createItem({
      familyId,
      ...validatedData,
      createdBy: userContext.memberId,
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
