/**
 * List Notifications Handler - Family Inventory Management System
 *
 * GET /families/{familyId}/notifications
 * Lists all notifications for a family, optionally filtered by status.
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { NotificationService } from '../services/notificationService';
import { LowStockNotificationStatus } from '../models/notification';
import {
  successResponse,
  handleError,
  getPathParameter,
  getQueryParameter,
  badRequestResponse,
} from '../lib/response';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../lib/logger';

/**
 * Valid status values for filtering notifications
 */
const VALID_STATUSES: LowStockNotificationStatus[] = ['active', 'resolved', 'acknowledged'];

/**
 * GET /families/{familyId}/notifications
 * List all notifications for a family
 *
 * Query Parameters:
 * - status (optional): Filter by notification status ('active', 'resolved', 'acknowledged')
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);

  logLambdaInvocation('listNotifications', event, context.awsRequestId);

  try {
    // Get authenticated user info from authorizer context
    const authorizer = event.requestContext.authorizer;
    if (!authorizer || !authorizer['familyId']) {
      throw new Error('Authentication required');
    }

    const userFamilyId = authorizer['familyId'] as string;
    const familyId = getPathParameter(event.pathParameters, 'familyId');

    // Ensure user can only access their own family
    if (familyId !== userFamilyId) {
      throw new Error('Access denied to this family');
    }

    // Get optional status filter
    const statusParam = getQueryParameter(event.queryStringParameters, 'status');
    let status: LowStockNotificationStatus | undefined;

    if (statusParam) {
      // Validate status parameter
      if (!VALID_STATUSES.includes(statusParam as LowStockNotificationStatus)) {
        return badRequestResponse(
          `Invalid status value. Must be one of: ${VALID_STATUSES.join(', ')}`,
          { providedStatus: statusParam, validStatuses: VALID_STATUSES }
        );
      }
      status = statusParam as LowStockNotificationStatus;
    }

    // Get notifications
    const notifications = await NotificationService.getNotifications(familyId, status);

    logger.info('Notifications retrieved successfully', {
      familyId,
      count: notifications.length,
      statusFilter: status || 'all',
    });

    logLambdaCompletion('listNotifications', Date.now() - startTime, context.awsRequestId);

    return successResponse(notifications);
  } catch (error) {
    logger.error('Failed to list notifications', error as Error);
    return handleError(error);
  }
};