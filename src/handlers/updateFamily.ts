import { APIGatewayProxyHandler } from 'aws-lambda';
import { FamilyService } from '../services/familyService';
import { updateFamilyRequestSchema } from '../types/schemas';
import { 
  successResponse, 
  handleError, 
  parseJsonBody,
  getPathParameter
} from '../lib/response';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../lib/logger';

/**
 * PUT /families/{familyId}
 * Update family details (admin only)
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('updateFamily', event, context.awsRequestId);

  try {
    // Get authenticated user info from authorizer context
    const authorizer = event.requestContext.authorizer;
    if (!authorizer || !authorizer['familyId'] || !authorizer['role']) {
      throw new Error('Authentication required');
    }

    const userFamilyId = authorizer['familyId'] as string;
    const userRole = authorizer['role'] as string;
    const familyId = getPathParameter(event.pathParameters, 'familyId');

    // Ensure user can only access their own family
    if (familyId !== userFamilyId) {
      throw new Error('Access denied to this family');
    }

    // Only admins can update family
    if (userRole !== 'admin') {
      throw new Error('Only admins can update family details');
    }

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
