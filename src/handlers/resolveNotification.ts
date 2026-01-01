/**
 * Resolve Notification Handler - Family Inventory Management System
 *
 * POST /families/{familyId}/notifications/{notificationId}/resolve
 * Marks a notification as resolved (admin only).
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
import { handleWarmup, warmupResponse } from '../lib/warmup.js';

/**
 * POST /families/{familyId}/notifications/{notificationId}/resolve
 * Resolve a notification (admin only)
 *
 * This endpoint allows family admins to manually resolve a low-stock notification,
 * indicating the issue has been addressed (e.g., item added to shopping list).
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  // Handle warmup events - exit early to avoid unnecessary processing
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);

  logLambdaInvocation('resolveNotification', event, context.awsRequestId);

  try {
    // Get authenticated user context (supports local development)
    const userContext = getUserContext(event, logger);
    const familyId = getPathParameter(event.pathParameters, 'familyId');
    const notificationId = getPathParameter(event.pathParameters, 'notificationId');

    // Ensure user can only access their own family
    await requireFamilyAccess(userContext, familyId);

    // Only admins can resolve notifications
    await requireAdmin(userContext, familyId);

    // Resolve the notification
    const notification = await NotificationService.resolveNotification(
      familyId,
      notificationId
    );

    logger.info('Notification resolved successfully', {
      familyId,
      notificationId,
      previousStatus: notification.status === 'resolved' ? 'already resolved' : 'active/acknowledged',
      newStatus: notification.status,
    });

    logLambdaCompletion('resolveNotification', Date.now() - startTime, context.awsRequestId);

    return successResponse(notification, 'Notification resolved successfully');
  } catch (error) {
    logger.error('Failed to resolve notification', error as Error);
    return handleError(error);
  }
};

