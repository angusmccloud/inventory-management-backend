import { APIGatewayProxyHandler } from 'aws-lambda';
import { FamilyService } from '../services/familyService.js';
import { 
  successResponse, 
  handleError, 
  getPathParameter,
  notFoundResponse
} from '../lib/response.js';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../lib/logger.js';
import { getUserContext, requireFamilyAccess } from '../lib/auth.js';
import { handleWarmup, warmupResponse } from '../lib/warmup.js';

/**
 * GET /families/{familyId}
 * Get family details
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  // Handle warmup events - exit early to avoid unnecessary processing
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('getFamily', event, context.awsRequestId);

  try {
    // Get authenticated user context (supports local development)
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');

    // Ensure user can only access their own family
    await requireFamilyAccess(userContext, familyId);

    // Get family
    const family = await FamilyService.getFamily(familyId);

    if (!family) {
      return notFoundResponse('Family');
    }

    logger.info('Family retrieved successfully', { familyId });

    logLambdaCompletion('getFamily', Date.now() - startTime, context.awsRequestId);

    return successResponse(family);
  } catch (error) {
    logger.error('Failed to get family', error as Error);
    return handleError(error);
  }
};
