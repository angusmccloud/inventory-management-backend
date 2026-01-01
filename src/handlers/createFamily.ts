import { APIGatewayProxyHandler } from 'aws-lambda';
import { FamilyService } from '../services/familyService.js';
import { createFamilyRequestSchema } from '../types/schemas.js';
import { 
  createdResponse, 
  handleError, 
  parseJsonBody 
} from '../lib/response.js';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../lib/logger.js';
import { getUserContext } from '../lib/auth.js';
import { handleWarmup, warmupResponse } from '../lib/warmup.js';

/**
 * POST /families
 * Create a new family with the authenticated user as the first admin
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  // Handle warmup events - exit early to avoid unnecessary processing
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('createFamily', event, context.awsRequestId);

  try {
    // Get authenticated user context (supports local development)
    const userContext = getUserContext(event, logger);

    // Parse and validate request body
    const body = parseJsonBody(event.body);
    const validatedData = createFamilyRequestSchema.parse(body);

    // Create family with the user as the first admin
    const { memberId, email, name } = userContext;
    const result = await FamilyService.createFamily(
      { name: validatedData.name, createdBy: memberId },
      { memberId, email, name }
    );

    logger.info('Family created successfully', {
      familyId: result.family.familyId,
      memberId,
    });

    logLambdaCompletion('createFamily', Date.now() - startTime, context.awsRequestId);

    return createdResponse(result, 'Family created successfully');
  } catch (error) {
    logger.error('Failed to create family', error as Error);
    return handleError(error);
  }
};
