import { APIGatewayProxyHandler } from 'aws-lambda';
import { FamilyService } from '../services/familyService.js';
import { updateFamilyRequestSchema } from '../types/schemas.js';
import { 
  successResponse, 
  handleError, 
  parseJsonBody,
  getPathParameter
} from '../lib/response.js';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../lib/logger.js';
import { getUserContext, requireFamilyAccess, requireAdmin } from '../lib/auth.js';
import { handleWarmup, warmupResponse } from '../lib/warmup.js';

/**
 * PUT /families/{familyId}
 * Update family details (admin only)
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  // Handle warmup events - exit early to avoid unnecessary processing
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('updateFamily', event, context.awsRequestId);

  try {
    // Get authenticated user context (supports local development)
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');

    // Ensure user can only access their own family
    await requireFamilyAccess(userContext, familyId);

    // Only admins can update family
    await requireAdmin(userContext, familyId);

    // Parse and validate request body
    const body = parseJsonBody(event.body);
    const validatedData = updateFamilyRequestSchema.parse(body);

    // Update family
    const family = await FamilyService.updateFamily(familyId, validatedData);

    logger.info('Family updated successfully', { familyId });

    logLambdaCompletion('updateFamily', Date.now() - startTime, context.awsRequestId);

    return successResponse(family, 'Family updated successfully');
  } catch (error) {
    logger.error('Failed to update family', error as Error);
    return handleError(error);
  }
};
