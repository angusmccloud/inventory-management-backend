/**
 * Accept Invitation Handler (Public Endpoint)
 * POST /invitations/accept
 * Feature: 003-member-management
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { logger } from '../../lib/logger';
import { successResponse, errorResponse } from '../../lib/response';
import { validateInvitationToken, acceptInvitation } from '../../services/invitationService';
import { validateToken } from '../../services/tokenService';
import { MemberModel } from '../../models/member';
import { FamilyModel } from '../../models/family';
import { AcceptInvitationRequestSchema } from '../../types/invitation';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env['AWS_REGION'] || 'us-east-1',
});

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Parse and validate request body
    const body = JSON.parse(event.body || '{}');
    const validationResult = AcceptInvitationRequestSchema.safeParse(body);

    if (!validationResult.success) {
      logger.warn('Invalid accept invitation request', { errors: validationResult.error.errors });
      return errorResponse(400, 'BadRequest', 'Invalid request body', validationResult.error.errors);
    }

    const { token, name, password } = validationResult.data;

    // Validate token signature
    const tokenValidation = await validateToken(token);
    if (!tokenValidation.valid) {
      logger.warn('Invalid invitation token signature');
      return errorResponse(401, 'Unauthorized', 'Invalid invitation token');
    }

    // Get invitation and validate
    const invitationValidation = await validateInvitationToken(token);
    if (!invitationValidation.valid || !invitationValidation.invitation) {
      return errorResponse(401, 'Unauthorized', invitationValidation.reason || 'Invalid invitation');
    }

    const invitation = invitationValidation.invitation;

    // Check if member already exists
    const existingMember = await MemberModel.getByMemberId(invitation.email);
    if (existingMember && existingMember.familyId === invitation.familyId) {
      return errorResponse(409, 'Conflict', 'A member with this email already exists in the family');
    }

    // Get family details
    const family = await FamilyModel.getById(invitation.familyId);
    if (!family) {
      return errorResponse(404, 'NotFound', 'Family not found');
    }

    // Create or get Cognito user
    let cognitoUserId: string;
    const userPoolId = process.env['COGNITO_USER_POOL_ID'];

    if (!userPoolId) {
      logger.error('COGNITO_USER_POOL_ID not configured');
      return errorResponse(500, 'InternalServerError', 'Authentication service not configured');
    }

    try {
      // Try to get existing user
      const getUserResponse = await cognitoClient.send(
        new AdminGetUserCommand({
          UserPoolId: userPoolId,
          Username: invitation.email,
        })
      );

      cognitoUserId = getUserResponse.Username!;
      logger.info('Existing Cognito user found', { email: invitation.email, cognitoUserId });
    } catch (error) {
      if ((error as any).name === 'UserNotFoundException') {
        // Create new Cognito user
        if (!password) {
          return errorResponse(400, 'BadRequest', 'Password is required for new users');
        }

        try {
          const createUserResponse = await cognitoClient.send(
            new AdminCreateUserCommand({
              UserPoolId: userPoolId,
              Username: invitation.email,
              UserAttributes: [
                { Name: 'email', Value: invitation.email },
                { Name: 'email_verified', Value: 'true' },
                { Name: 'name', Value: name },
              ],
              MessageAction: 'SUPPRESS', // We send our own invitation email
              TemporaryPassword: password,
            })
          );

          cognitoUserId = createUserResponse.User?.Username || invitation.email;

          // Set permanent password
          await cognitoClient.send(
            new AdminSetUserPasswordCommand({
              UserPoolId: userPoolId,
              Username: cognitoUserId,
              Password: password,
              Permanent: true,
            })
          );

          logger.info('New Cognito user created', { email: invitation.email, cognitoUserId });
        } catch (createError) {
          logger.error('Failed to create Cognito user', createError as Error);
          return errorResponse(500, 'InternalServerError', 'Failed to create user account');
        }
      } else {
        throw error;
      }
    }

    // Create Member record in DynamoDB
    const member = await MemberModel.create(
      {
        familyId: invitation.familyId,
        email: invitation.email,
        name,
        role: invitation.role,
      },
      cognitoUserId // Use Cognito sub as memberId
    );

    // Update invitation status to accepted
    await acceptInvitation(invitation, member.memberId);

    logger.info('Invitation accepted successfully', {
      invitationId: invitation.invitationId,
      memberId: member.memberId,
      email: invitation.email,
      role: invitation.role,
      familyId: invitation.familyId,
    });

    return successResponse(201, {
      member: {
        memberId: member.memberId,
        familyId: member.familyId,
        email: member.email,
        name: member.name,
        role: member.role,
        status: member.status,
        version: member.version,
        createdAt: member.createdAt,
        updatedAt: member.updatedAt,
      },
      family: {
        familyId: family.familyId,
        name: family.name,
      },
    });
  } catch (error) {
    logger.error('Failed to accept invitation', error as Error, {
      path: event.path,
    });
    return errorResponse(500, 'InternalServerError', 'Failed to accept invitation');
  }
}

