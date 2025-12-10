/**
 * OPTIONS Handler - CORS Preflight Requests
 * 
 * Handles OPTIONS preflight requests for CORS.
 * Returns appropriate CORS headers without requiring authentication.
 */

import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';

/**
 * Handle OPTIONS preflight requests
 */
export const handler: APIGatewayProxyHandler = async (): Promise<APIGatewayProxyResult> => {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Max-Age': '3600',
    },
    body: '',
  };
};

