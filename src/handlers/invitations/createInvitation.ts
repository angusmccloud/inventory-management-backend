/**
 * Create Invitation Handler
 * POST /families/{familyId}/invitations
 * Feature: 003-member-management
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { logger } from '../../lib/logger';
import { successResponse, errorResponse } from '../../lib/response';
import { getAuthContext, requireAdmin, verifyFamilyAccess } from '../../lib/authorization';
import { createInvitation } from '../../services/invitationService';
import { getMember } from '../../services/memberService';
import { FamilyModel } from '../../models/family';
import { CreateInvitationRequestSchema } from '../../types/invitation';
import { handleWarmup, warmupResponse } from '../../lib/warmup.js';

export async function handler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
  // Handle warmup events - exit early to avoid unnecessary processing
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  try {
    // Get auth context
    const authContext = await getAuthContext(event);

    // Require admin role
    const authError = requireAdmin(authContext);
    if (authError) return authError;

    // Get familyId from path
    const familyId = event.pathParameters?.['familyId'];
    if (!familyId) {
      return errorResponse(400, 'BadRequest', 'Missing familyId in path');
    }

    // Verify family access
    const accessError = verifyFamilyAccess(authContext!, familyId);
    if (accessError) return accessError;

    // Parse and validate request body
    const body = JSON.parse(event.body || '{}');
    const validationResult = CreateInvitationRequestSchema.safeParse(body);

    if (!validationResult.success) {
      logger.warn('Invalid invitation request', { errors: validationResult.error.errors });
      return errorResponse(400, 'BadRequest', 'Invalid request body', validationResult.error.errors);
    }

    const request = validationResult.data;

    // Get inviter details
    const inviter = await getMember(familyId, authContext!.memberId);
    if (!inviter) {
      return errorResponse(404, 'NotFound', 'Inviter member not found');
    }

    // Get family details
    const family = await FamilyModel.getById(familyId);
    if (!family) {
      return errorResponse(404, 'NotFound', 'Family not found');
    }

    // Create invitation
    try {
      const invitation = await createInvitation(
        familyId,
        request,
        authContext!.memberId,
        inviter.name,
        family.name
      );

      logger.info('Invitation created successfully', {
        invitationId: invitation.invitationId,
        email: invitation.email,
        role: invitation.role,
        familyId,
      });

      // Remove sensitive fields from response
      const { token, tokenSignature, ...safeInvitation } = invitation;

      return successResponse(201, {
        ...safeInvitation,
        invitedByName: inviter.name,
      });
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (errorMessage === 'DUPLICATE_INVITATION') {
        return errorResponse(409, 'Conflict', 'A pending invitation already exists for this email address');
      }

      if (errorMessage === 'MEMBER_ALREADY_EXISTS') {
        return errorResponse(409, 'Conflict', 'A member with this email already exists in the family');
      }

      throw error;
    }
  } catch (error) {
    logger.error('Failed to create invitation', error as Error, {
      path: event.path,
      familyId: event.pathParameters?.['familyId'],
    });
    return errorResponse(500, 'InternalServerError', 'Failed to create invitation');
  }
}

