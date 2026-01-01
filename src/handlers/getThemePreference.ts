/**
 * GET /users/{userId}/preferences/theme
 * 
 * Retrieves the authenticated user's theme preference.
 * Returns 'auto' if no preference is set.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { ThemePreference } from '../types/preference';
import { handleWarmup, warmupResponse } from '../lib/warmup.js';
import { successResponse, errorResponse } from '../lib/response.js';
import { getUserContext } from '../lib/auth.js';
import { createLambdaLogger } from '../lib/logger.js';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env['TABLE_NAME'] || '';

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  // Handle warmup events - exit early to avoid unnecessary processing
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  const logger = createLambdaLogger(context.awsRequestId);

  try {
    // Get authenticated user context
    const userContext = getUserContext(event, logger);
    
    // Extract userId from path parameters
    const pathUserId = event.pathParameters?.['userId'];

    if (!pathUserId) {
      return errorResponse(400, 'MISSING_PARAMETER', 'Missing userId in path');
    }

    // Verify the authenticated user is requesting their own data
    if (pathUserId !== userContext.memberId) {
      return errorResponse(403, 'FORBIDDEN', 'Forbidden - can only access own preferences');
    }

    // Query DynamoDB for user preference record
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${pathUserId}`,
          SK: `PREFERENCES`,
        },
      })
    );

    // Extract theme preference or default to 'auto'
    const themePreference: ThemePreference = 
      (result.Item?.['theme'] as ThemePreference) || 'auto';

    return successResponse({ theme: themePreference });
  } catch (error) {
    console.error('Error retrieving theme preference:', error);
    return errorResponse(
      500,
      'INTERNAL_ERROR',
      'Failed to retrieve theme preference',
      error instanceof Error ? error.message : undefined
    );
  }
};
