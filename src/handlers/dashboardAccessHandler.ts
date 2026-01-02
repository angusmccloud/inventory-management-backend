import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DashboardService } from '../services/dashboardService';
import { successResponse, errorResponse } from '../lib/response';
import { handleWarmup } from '../lib/warmup';
import { logger } from '../lib/logger';

/**
 * GET /d/{dashboardId} - Public access to view a dashboard
 * No authentication required - public access via dashboard link
 */
export async function getDashboardPublic(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  // Handle warmup events
  if (handleWarmup(event, context)) {
    return successResponse({ message: 'Dashboard public access handler warmed up' });
  }

  try {
    const dashboardId = event.pathParameters?.['dashboardId'];

    if (!dashboardId) {
      logger.warn('Missing dashboardId in path parameters');
      return errorResponse(400, 'MISSING_DASHBOARD_ID', 'Dashboard ID is required');
    }

    logger.info('Fetching public dashboard', { dashboardId });

    const dashboard = await DashboardService.getDashboardPublic(dashboardId);

    if (!dashboard) {
      logger.warn('Dashboard not found', { dashboardId });
      return errorResponse(404, 'NOT_FOUND', 'Dashboard not found');
    }

    return successResponse(dashboard);
  } catch (error) {
    logger.error(
      'Error fetching public dashboard',
      error instanceof Error ? error : new Error('Unknown error')
    );

    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse(404, 'NOT_FOUND', 'Dashboard not found');
    }

    return errorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

/**
 * POST /d/{dashboardId}/access - Record dashboard access (analytics)
 * No authentication required - silent tracking
 */
export async function recordDashboardAccess(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  // Handle warmup events
  if (handleWarmup(event, context)) {
    return successResponse({ message: 'Dashboard access record handler warmed up' });
  }

  try {
    const dashboardId = event.pathParameters?.['dashboardId'];

    if (!dashboardId) {
      // Silent fail for analytics - don't expose errors to client
      logger.warn('Missing dashboardId for access recording');
      return successResponse({ message: 'Access recorded' });
    }

    logger.info('Recording dashboard access', { dashboardId });

    await DashboardService.recordAccess(dashboardId);

    return successResponse({ message: 'Access recorded' });
  } catch (error) {
    // Silent fail for analytics - don't expose errors to client
    logger.error(
      'Error recording dashboard access',
      error instanceof Error ? error : new Error('Unknown error')
    );

    // Return success anyway - analytics failures shouldn't impact UX
    return successResponse({ message: 'Access recorded' });
  }
}

/**
 * Main handler that routes to the appropriate function
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod;
  const path = event.path;
  
  // GET /d/{dashboardId} - Public dashboard access
  if (method === 'GET' && path.match(/^\/d\/[^/]+$/)) {
    return getDashboardPublic(event, context);
  }
  
  // POST /d/{dashboardId}/access - Record access
  if (method === 'POST' && path.match(/^\/d\/[^/]+\/access$/)) {
    return recordDashboardAccess(event, context);
  }
  
  // Fallback
  return errorResponse(404, 'NOT_FOUND', 'Route not found');
};
