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
export const getUserContext = (
  event: APIGatewayProxyEvent,
  logger?: Logger,
  requireFamilyId = false
): UserContext => {
  const authorizer = event.requestContext.authorizer;
  
  // **DEVELOPMENT MODE BYPASS** - Use mock auth in local development
  if (!authorizer || !authorizer['memberId']) {
    if (process.env['AWS_SAM_LOCAL'] === 'true') {
      // Use mock user for local development
      // Note: familyId is not set here because the user can access any family in local mode
      // Family access checks are bypassed when AWS_SAM_LOCAL=true
      const mockContext: UserContext = {
        memberId: 'mock-user-id',
        email: 'connort@gmail.com',
        name: 'Test User',
        role: 'admin', // Mock user has admin access in local development
      };
      
      logger?.warn('Using mock authentication for local development');
      return mockContext;
    }
    
    throw new Error('Authentication required');
  }
  
  // Extract user context from authorizer
  const userContext: UserContext = {
    memberId: authorizer['memberId'] as string,
    email: authorizer['email'] as string,
    name: authorizer['name'] as string,
  };
  
  // Add optional fields if present
  if (authorizer['familyId']) {
    userContext.familyId = authorizer['familyId'] as string;
  }
  
  if (authorizer['role']) {
    userContext.role = authorizer['role'] as string;
  }
  
  // Validate required fields
  if (requireFamilyId && !userContext.familyId) {
    throw new Error('User must be member of a family');
  }
  
  return userContext;
};

/**
 * Verify user has admin role
 * 
 * @param userContext - User context with role
 * @throws Error if user is not an admin
 */
export const requireAdmin = (userContext: UserContext): void => {
  // In local development, skip role check (mock user has full access)
  if (process.env['AWS_SAM_LOCAL'] === 'true') {
    return;
  }
  
  if (userContext.role !== 'admin') {
    throw new Error('Admin role required for this operation');
  }
};

/**
 * Verify user has access to specified family
 * 
 * @param userContext - User context with familyId
 * @param familyId - Family ID to check access for
 * @throws Error if user does not have access to family
 */
export const requireFamilyAccess = (userContext: UserContext, familyId: string): void => {
  // In local development, skip family access check (single user has access to all families)
  if (process.env['AWS_SAM_LOCAL'] === 'true') {
    return;
  }
  
  if (userContext.familyId !== familyId) {
    throw new Error('Access denied to this family');
  }
};

