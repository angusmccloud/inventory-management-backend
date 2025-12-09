import { APIGatewayProxyHandler } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, getTableName } from '../lib/dynamodb.js';
import { QueryPatterns } from '../types/entities.js';
import { Member } from '../types/entities.js';
import { 
  successResponse, 
  handleError 
} from '../lib/response.js';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../lib/logger.js';
import { getUserContext } from '../lib/auth.js';

/**
 * GET /user/families
 * List all families the authenticated user is a member of
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  
  logLambdaInvocation('listUserFamilies', event, context.awsRequestId);

  try {
    // Get authenticated user context (supports local development)
    const userContext = getUserContext(event, logger);

    // Query GSI1 to get all families the user is a member of
    const queryParams = QueryPatterns.getMemberFamilies(userContext.memberId);
    const result = await docClient.send(
      new QueryCommand({
        TableName: getTableName(),
        ...queryParams,
      })
    );

    const memberRecords = (result.Items || []) as Member[];
    
    // Extract unique family information from member records
    const families = memberRecords.map(member => ({
      familyId: member.familyId,
      role: member.role,
      status: member.status,
      // We only have basic info from the member record
      // Frontend can fetch full family details if needed
    }));

    logger.info('User families retrieved successfully', { 
      memberId: userContext.memberId, 
      familyCount: families.length 
    });

    logLambdaCompletion('listUserFamilies', Date.now() - startTime, context.awsRequestId);

    return successResponse({ families });
  } catch (error) {
    logger.error('Failed to list user families', error as Error);
    return handleError(error);
  }
};

