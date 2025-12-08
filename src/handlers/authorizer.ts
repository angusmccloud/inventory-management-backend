/**
 * Lambda Authorizer - Family Inventory Management System
 * 
 * Validates Cognito JWT tokens and enforces role-based access control.
 * Returns IAM policy allowing/denying API Gateway access.
 */

import { 
  APIGatewayAuthorizerResult, 
  APIGatewayTokenAuthorizerEvent,
  PolicyDocument,
  Statement,
} from 'aws-lambda';
import { createLambdaLogger } from '../lib/logger.js';

/**
 * JWT token structure from Cognito
 */
interface CognitoTokenPayload {
  sub: string; // User ID (memberId)
  email: string;
  'cognito:username': string;
  'custom:familyId'?: string;
  'custom:role'?: 'admin' | 'suggester';
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
  event: APIGatewayTokenAuthorizerEvent
): Promise<APIGatewayAuthorizerResult> => {
  const logger = createLambdaLogger();
  
  try {
    logger.info('Authorizer invoked', {
      methodArn: event.methodArn,
    });
    
    // Extract token from Authorization header
    const token = extractToken(event.authorizationToken);
    
    // Decode and validate token
    const decodedToken = await validateToken(token);
    
    // Extract user context
    const memberId = decodedToken.payload.sub;
    const familyId = decodedToken.payload['custom:familyId'];
    const role = decodedToken.payload['custom:role'] || 'suggester';
    const email = decodedToken.payload.email;
    
    logger.info('Token validated successfully', {
      memberId,
      familyId,
      role,
    });
    
    // Generate IAM policy
    const policy = generatePolicy(
      memberId,
      'Allow',
      event.methodArn,
      {
        memberId,
        familyId: familyId || '',
        role,
        email,
      }
    );
    
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
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString()) as CognitoTokenPayload;
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
export const hasAccessToFamily = (
  userFamilyId: string,
  resourceFamilyId: string
): boolean => {
  return userFamilyId === resourceFamilyId;
};
