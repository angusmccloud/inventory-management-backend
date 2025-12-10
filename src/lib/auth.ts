/**
 * Authentication Utilities - Family Inventory Management System
 * 
 * Helper functions for extracting and validating user context from API Gateway events.
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { Logger } from './logger.js';

/**
 * User context extracted from authorizer or mock for local development
 */
export interface UserContext {
  memberId: string;
  email: string;
  name: string;
  familyId?: string;
  role?: string;
}

/**
 * Get authenticated user context from API Gateway event
 * 
 * In production: Extracts from Cognito authorizer context
 * In local development (AWS_SAM_LOCAL=true): Uses mock user for testing
 * 
 * @param event - API Gateway proxy event
 * @param logger - Logger instance for warnings
 * @param requireFamilyId - Whether familyId is required (default: false)
 * @returns User context with memberId, email, name, and optional familyId/role
 * @throws Error if authentication is missing in production
 */
/**
 * Decode JWT payload (without verification - already verified by Cognito)
 */
const decodeJWT = (token: string): Record<string, unknown> => {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT token');
  }
  
  const payload = parts[1];
  if (!payload) {
    throw new Error('Invalid JWT payload');
  }
  
  const decoded = Buffer.from(payload, 'base64').toString('utf8');
  return JSON.parse(decoded) as Record<string, unknown>;
};

export const getUserContext = (
  event: APIGatewayProxyEvent,
  logger?: Logger,
  requireFamilyId = false
): UserContext => {
  // **DEVELOPMENT MODE BYPASS** - Use mock auth in local development
  if (process.env['AWS_SAM_LOCAL'] === 'true') {
    const mockContext: UserContext = {
      memberId: 'mock-user-id',
      email: 'connort@gmail.com',
      name: 'Test User',
      role: 'admin',
    };
    
    logger?.warn('Using mock authentication for local development');
    return mockContext;
  }
  
  // Extract JWT from Authorization header
  const authHeader = event.headers?.['Authorization'] || event.headers?.['authorization'];
  if (!authHeader) {
    throw new Error('Authentication required');
  }
  
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    throw new Error('Authentication required');
  }
  
  // Decode JWT (already validated by Cognito authorizer)
  const claims = decodeJWT(token);
  
  // Extract user context from JWT claims
  const email = claims['email'] as string;
  const userContext: UserContext = {
    memberId: claims['sub'] as string || claims['cognito:username'] as string,
    email: email,
    // Use name from JWT, or fall back to email local part if not provided
    name: (claims['name'] as string) || email.split('@')[0] || 'User',
  };
  
  // Add optional fields if present (for future use when stored in DynamoDB)
  if (claims['custom:familyId']) {
    userContext.familyId = claims['custom:familyId'] as string;
  }
  
  if (claims['custom:role']) {
    userContext.role = claims['custom:role'] as string;
  }
  
  // Validate required fields
  if (requireFamilyId && !userContext.familyId) {
    throw new Error('User must be member of a family');
  }
  
  return userContext;
};

/**
 * Verify user has admin role for the specified family
 * 
 * @param userContext - User context with memberId
 * @param familyId - Family ID to check admin role for
 * @throws Error if user is not an admin of this family
 */
export const requireAdmin = async (userContext: UserContext, familyId: string): Promise<void> => {
  // In local development, skip role check (mock user has full access)
  if (process.env['AWS_SAM_LOCAL'] === 'true') {
    return;
  }
  
  // Import MemberModel dynamically to avoid circular dependencies
  const { MemberModel } = await import('../models/member.js');
  
  // Get member record from DynamoDB to check role
  const member = await MemberModel.getById(familyId, userContext.memberId);
  
  if (!member) {
    throw new Error('Access denied to this family');
  }
  
  if (member.role !== 'admin') {
    throw new Error('Admin role required for this operation');
  }
};

/**
 * Verify user has access to specified family
 * 
 * NOTE: This is a simplified check for now. In production, you should:
 * 1. Query DynamoDB to verify user is a member of this family
 * 2. Cache the result to avoid repeated queries
 * 
 * For MVP, we'll allow access if the user is authenticated.
 * The real check happens when querying data (user can only see their own families/items).
 * 
 * @param userContext - User context with memberId
 * @param familyId - Family ID to check access for
 * @throws Error if user is not a member of this family
 */
export const requireFamilyAccess = async (userContext: UserContext, familyId: string): Promise<void> => {
  // In local development, skip family access check
  if (process.env['AWS_SAM_LOCAL'] === 'true') {
    return;
  }
  
  const { MemberModel } = await import('../models/member.js');
  const member = await MemberModel.getById(familyId, userContext.memberId);
  
  if (!member || member.status !== 'active') {
    throw new Error('Access denied to this family');
  }
  
  // Placeholder - actual membership check would happen here via DynamoDB query
  void userContext;
  void familyId;
};

