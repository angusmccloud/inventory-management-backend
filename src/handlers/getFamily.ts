import { APIGatewayProxyHandler } from 'aws-lambda';
import { FamilyService } from '../services/familyService';
import { 
  successResponse, 
  handleError, 
  getPathParameter,
  notFoundResponse
} from '../lib/response';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../lib/logger';

/**
 * GET /families/{familyId}
 * Get family details
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('getFamily', event, context.awsRequestId);

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
