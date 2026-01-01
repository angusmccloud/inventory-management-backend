/**
 * PUT /users/{userId}/preferences/theme
 * 
 * Updates the authenticated user's theme preference.
 * Validates theme value and persists to DynamoDB.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { ThemePreference } from '../types/preference';
import { handleWarmup, warmupResponse } from '../lib/warmup.js';
import { successResponse, errorResponse } from '../lib/response.js';
import { getUserContext } from '../lib/auth.js';
import { createLambdaLogger } from '../lib/logger.js';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env['TABLE_NAME'] || '';

interface UpdateThemeRequest {
  theme: ThemePreference;
}

const isValidTheme = (value: unknown): value is ThemePreference => {
  return value === 'light' || value === 'dark' || value === 'auto';
};

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

    // Verify the authenticated user is updating their own data
    if (pathUserId !== userContext.memberId) {
      return errorResponse(403, 'FORBIDDEN', 'Forbidden - can only update own preferences');
    }

    // Parse and validate request body
    if (!event.body) {
      return errorResponse(400, 'MISSING_BODY', 'Missing request body');
    }

    const requestData: UpdateThemeRequest = JSON.parse(event.body);

    if (!requestData.theme || !isValidTheme(requestData.theme)) {
      return errorResponse(
        400,
        'INVALID_THEME',
        'Invalid theme value. Must be "light", "dark", or "auto"'
      );
    }

    // Update theme preference in DynamoDB
    const now = new Date().toISOString();
    
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${pathUserId}`,
          SK: `PREFERENCES`,
        },
        UpdateExpression: 'SET theme = :theme, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':theme': requestData.theme,
          ':updatedAt': now,
        },
      })
    );

    return successResponse({ theme: requestData.theme });
  } catch (error) {
    console.error('Error updating theme preference:', error);
    return errorResponse(
      500,
      'INTERNAL_ERROR',
      'Failed to update theme preference',
      error instanceof Error ? error.message : undefined
    );
  }
};
