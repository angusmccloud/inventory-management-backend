/**
 * Lambda Authorizer - Family Inventory Management System
 *
 * Validates Cognito JWT tokens and enforces role-based access control.
 * Queries DynamoDB for member familyId and role (authorization context).
 * Returns IAM policy allowing/denying API Gateway access.
 */

import {
  APIGatewayAuthorizerResult,
  APIGatewayTokenAuthorizerEvent,
  PolicyDocument,
  Statement,
  Context,
} from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { createLambdaLogger } from '../lib/logger.js';
import { docClient, getTableName } from '../lib/dynamodb.js';
import type { Member } from '../types/entities.js';
import { handleWarmup } from '../lib/warmup.js';

/**
 * JWT token structure from Cognito
 */
interface CognitoTokenPayload {
  sub: string; // User ID (memberId)
  email: string;
  'cognito:username': string;
  exp: number;
  iat: number;
  token_use: 'id' | 'access';
}

/**
 * Decoded JWT structure
 */
interface DecodedToken {
  header: {
    kid: string;
    alg: string;
  };
  payload: CognitoTokenPayload;
  signature: string;
}

/**
 * Lambda authorizer handler
 *
 * Validates Cognito JWT token and returns IAM policy.
 * Token format: "Bearer <token>"
 */
export const handler = async (
  event: APIGatewayTokenAuthorizerEvent,
  context: Context
): Promise<APIGatewayAuthorizerResult> => {
  // Handle warmup events - exit early to avoid unnecessary processing
  if (handleWarmup(event as any, context)) {
    // For authorizers, we need to return a policy, not an HTTP response
    return {
      principalId: 'warmup',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: 'Deny',
            Resource: event.methodArn,
          },
        ],
      },
    };
  }

  const logger = createLambdaLogger();

  try {
    logger.info('Authorizer invoked', {
      methodArn: event.methodArn,
    });

    // Extract token from Authorization header
    const token = extractToken(event.authorizationToken);

    // **DEVELOPMENT MODE BYPASS** - Allow mock tokens in local development
    // Mock tokens are base64-encoded JSON, not proper JWTs
    if (!token.includes('.') && process.env['AWS_SAM_LOCAL'] === 'true') {
      logger.warn('Using mock auth bypass for local development');
      
      try {
        const mockPayload = JSON.parse(Buffer.from(token, 'base64').toString());
        const mockMemberId = mockPayload.sub || 'mock-user-id';
        const mockEmail = mockPayload.email || 'test@example.com';
        
        // Return permissive policy for local development
        return generatePolicy(mockMemberId, 'Allow', event.methodArn, {
          memberId: mockMemberId,
          familyId: '', // Empty until family is created
          role: 'admin',
          email: mockEmail,
        });
      } catch {
        logger.warn('Failed to parse mock token, continuing with normal auth');
      }
    }

    // Decode and validate token
    const decodedToken = await validateToken(token);

    // Extract user context from JWT
    const memberId = decodedToken.payload.sub;
    const email = decodedToken.payload.email;

    // Query DynamoDB for member's familyId and role
    // Uses GSI1: GSI1PK = MEMBER#{memberId}
    const memberData = await getMemberFromDynamoDB(memberId);

    if (!memberData) {
      logger.warn('Member not found in DynamoDB', { memberId });
      throw new Error('Member not found - please complete family registration');
    }

    if (memberData.status === 'removed') {
      logger.warn('Member has been removed from family', {
        memberId,
        familyId: memberData.familyId,
      });
      throw new Error('Access revoked - member removed from family');
    }

    logger.info('Token validated successfully', {
      memberId,
      familyId: memberData.familyId,
      role: memberData.role,
    });

    // Generate IAM policy
    const policy = generatePolicy(memberId, 'Allow', event.methodArn, {
      memberId,
      familyId: memberData.familyId,
      role: memberData.role,
      email,
    });

    return policy;
  } catch (error) {
    logger.error('Authorization failed', error as Error);

    // Return explicit deny policy
    throw new Error('Unauthorized');
  }
};

/**
 * Extract JWT token from Authorization header
 */
const extractToken = (authorizationToken: string): string => {
  if (!authorizationToken) {
    throw new Error('No authorization token provided');
  }

  // Expected format: "Bearer <token>"
  const parts = authorizationToken.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    throw new Error('Invalid authorization header format');
  }

  return parts[1];
};

/**
 * Validate JWT token
 *
 * For production, this should verify the token signature against Cognito's public keys.
 * This simplified version decodes and validates basic structure and expiration.
 */
const validateToken = async (token: string): Promise<DecodedToken> => {
  // Decode JWT (base64url decode without verification for now)
  const parts = token.split('.');

  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  try {
    const headerPart = parts[0];
    const payloadPart = parts[1];
    const signaturePart = parts[2];

    if (!headerPart || !payloadPart || !signaturePart) {
      throw new Error('Invalid JWT structure');
    }

    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString());
    const payload = JSON.parse(
      Buffer.from(payloadPart, 'base64url').toString()
    ) as CognitoTokenPayload;
    const signature = signaturePart;

    // Validate token expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      throw new Error('Token has expired');
    }

    // Validate token type
    if (payload.token_use !== 'id' && payload.token_use !== 'access') {
      throw new Error('Invalid token type');
    }

    // Validate required claims
    if (!payload.sub || !payload.email) {
      throw new Error('Missing required token claims');
    }

    return {
      header,
      payload,
      signature,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to decode token');
  }
};

/**
 * Query DynamoDB for member information
 *
 * Uses GSI1 to look up member by memberId:
 * GSI1PK = MEMBER#{memberId}
 *
 * Returns member's familyId and role for authorization context.
 */
const getMemberFromDynamoDB = async (memberId: string): Promise<Member | null> => {
  const tableName = getTableName();
  const logger = createLambdaLogger();

  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :gsi1pk',
        ExpressionAttributeValues: {
          ':gsi1pk': `MEMBER#${memberId}`,
        },
        Limit: 1,
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    return result.Items[0] as Member;
  } catch (error) {
    logger.error('Failed to query DynamoDB for member', error as Error, {
      memberId,
    });
    throw new Error('Failed to retrieve member information');
  }
};

/**
 * Generate IAM policy document
 */
const generatePolicy = (
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context?: Record<string, string>
): APIGatewayAuthorizerResult => {
  const policyDocument: PolicyDocument = {
    Version: '2012-10-17',
    Statement: [],
  };

  const statement: Statement = {
    Action: 'execute-api:Invoke',
    Effect: effect,
    Resource: resource,
  };

  policyDocument.Statement.push(statement);

  const authResponse: APIGatewayAuthorizerResult = {
    principalId,
    policyDocument,
    context: context || {},
  };

  return authResponse;
};

/**
 * Helper to check if user has admin role
 */
export const isAdmin = (role: string): boolean => {
  return role === 'admin';
};

/**
 * Helper to check if user has access to family resources
 */
export const hasAccessToFamily = (userFamilyId: string, resourceFamilyId: string): boolean => {
  return userFamilyId === resourceFamilyId;
};
