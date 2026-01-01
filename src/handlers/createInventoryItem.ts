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
import { handleWarmup, warmupResponse } from '../lib/warmup.js';

/**
 * POST /families/{familyId}/inventory
 * Create a new inventory item
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  // Handle warmup events - exit early to avoid unnecessary processing
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('createInventoryItem', event, context.awsRequestId);

  try {
    // Get authenticated user context (supports local development)
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');

    // Ensure user can only access their own family
    await requireFamilyAccess(userContext, familyId);

    // Only admins can create inventory items
    await requireAdmin(userContext, familyId);

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
