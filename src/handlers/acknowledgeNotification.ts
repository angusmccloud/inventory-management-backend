/**
 * Acknowledge Notification Handler - Family Inventory Management System
 *
 * POST /families/{familyId}/notifications/{notificationId}/acknowledge
 * Marks a notification as acknowledged (admin only).
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { NotificationService } from '../services/notificationService';
import {
  successResponse,
  handleError,
  getPathParameter,
  forbiddenResponse,
} from '../lib/response';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../lib/logger';

/**
 * POST /families/{familyId}/notifications/{notificationId}/acknowledge
 * Acknowledge a notification (admin only)
 *
 * This endpoint allows family admins to acknowledge a low-stock notification,
 * indicating they are aware of the issue and will take action.
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);

  logLambdaInvocation('acknowledgeNotification', event, context.awsRequestId);

  try {
    // Get authenticated user info from authorizer context
    const authorizer = event.requestContext.authorizer;
    if (!authorizer || !authorizer['familyId']) {
      throw new Error('Authentication required');
    }

    const userFamilyId = authorizer['familyId'] as string;
    const userRole = authorizer['role'] as string | undefined;
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const notificationId = getPathParameter(event.pathParameters, 'notificationId');

    // Ensure user can only access their own family
    if (familyId !== userFamilyId) {
      throw new Error('Access denied to this family');
    }

    // Check if user is an admin
    if (userRole !== 'admin') {
      logger.warn('Non-admin user attempted to acknowledge notification', {
        familyId,
        notificationId,
        userRole,
      });
      return forbiddenResponse('Only family admins can acknowledge notifications');
    }

    // Acknowledge the notification
    const notification = await NotificationService.acknowledgeNotification(
      familyId,
      notificationId
    );

    logger.info('Notification acknowledged successfully', {
      familyId,
      notificationId,
      previousStatus: 'active',
      newStatus: notification.status,
    });

    logLambdaCompletion('acknowledgeNotification', Date.now() - startTime, context.awsRequestId);

    return successResponse(notification, 'Notification acknowledged successfully');
  } catch (error) {
    logger.error('Failed to acknowledge notification', error as Error);
    return handleError(error);
  }
};