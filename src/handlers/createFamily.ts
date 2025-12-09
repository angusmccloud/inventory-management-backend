import { APIGatewayProxyHandler } from 'aws-lambda';
import { FamilyService } from '../services/familyService';
import { createFamilyRequestSchema } from '../types/schemas';
import { 
  createdResponse, 
  handleError, 
  parseJsonBody 
} from '../lib/response';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../lib/logger';

/**
 * POST /families
 * Create a new family with the authenticated user as the first admin
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('createFamily', event, context.awsRequestId);

  try {
    // Get authenticated user info from authorizer context
    const authorizer = event.requestContext.authorizer;
    if (!authorizer || !authorizer['memberId']) {
      throw new Error('Authentication required');
    }

    const memberId = authorizer['memberId'] as string;
    const email = authorizer['email'] as string;
    const name = authorizer['name'] as string;

    // Parse and validate request body
    const body = parseJsonBody(event.body);
    const validatedData = createFamilyRequestSchema.parse(body);

    // Create family with the user as the first admin
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
