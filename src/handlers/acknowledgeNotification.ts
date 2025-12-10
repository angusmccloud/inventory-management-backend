/**
 * Acknowledge Notification Handler - Family Inventory Management System
 *
 * POST /families/{familyId}/notifications/{notificationId}/acknowledge
 * Marks a notification as acknowledged (admin only).
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { NotificationService } from '../services/notificationService.js';
import {
  successResponse,
  handleError,
  getPathParameter,
} from '../lib/response.js';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../lib/logger.js';
import { getUserContext, requireFamilyAccess, requireAdmin } from '../lib/auth.js';

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
    // Get authenticated user context (supports local development)
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const notificationId = getPathParameter(event.pathParameters, 'notificationId');

    // Ensure user can only access their own family
    await requireFamilyAccess(userContext, familyId);

    // Only admins can acknowledge notifications
    await requireAdmin(userContext, familyId);

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