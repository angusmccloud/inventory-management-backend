import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DashboardService } from '../services/dashboardService';
import { successResponse, errorResponse } from '../lib/response';
import { handleWarmup } from '../lib/warmup';
import { getAuthContext } from '../lib/authorization';
import { requireAdmin } from '../lib/authorization';
import { CreateDashboardInput, UpdateDashboardInput } from '../types/dashboard';
import { logger } from '../lib/logger';

/**
 * GET /api/dashboards - List all dashboards for a family
 * Requires admin authentication
 */
export async function listDashboards(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  // Handle warmup events
  if (handleWarmup(event, context)) {
    return successResponse({ message: 'List dashboards handler warmed up' });
  }

  try {
    const authContext = await getAuthContext(event);
    const adminCheck = requireAdmin(authContext);
    if (adminCheck) {
      return adminCheck;
    }

    const { familyId } = authContext!;
    const includeInactive = event.queryStringParameters?.['includeInactive'] === 'true';

    logger.info('Listing dashboards', { familyId, includeInactive });

    const dashboards = await DashboardService.listDashboards(familyId, includeInactive);

    return successResponse({ dashboards });
  } catch (error) {
    logger.error(
      'Error listing dashboards',
      error instanceof Error ? error : new Error('Unknown error')
    );

    return errorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

/**
 * POST /api/dashboards - Create a new dashboard
 * Requires admin authentication
 */
export async function createDashboard(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  // Handle warmup events
  if (handleWarmup(event, context)) {
    return successResponse({ message: 'Create dashboard handler warmed up' });
  }

  try {
    const authContext = await getAuthContext(event);
    const adminCheck = requireAdmin(authContext);
    if (adminCheck) {
      return adminCheck;
    }

    const { familyId, memberId } = authContext!;

    // Parse request body
    if (!event.body) {
      logger.warn('Missing request body');
      return errorResponse(400, 'MISSING_BODY', 'Request body is required');
    }

    let input: CreateDashboardInput;
    try {
      input = JSON.parse(event.body) as CreateDashboardInput;
    } catch (error) {
      logger.warn('Invalid JSON in request body', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return errorResponse(400, 'INVALID_JSON', 'Invalid request body');
    }

    // Validate input
    if (!input.title || input.title.trim().length === 0) {
      return errorResponse(400, 'MISSING_TITLE', 'Dashboard title is required');
    }

    if (input.title.length > 100) {
      return errorResponse(400, 'TITLE_TOO_LONG', 'Dashboard title must be 100 characters or less');
    }

    if (!input.type || !['location', 'items'].includes(input.type)) {
      return errorResponse(400, 'INVALID_TYPE', 'Dashboard type must be "location" or "items"');
    }

    if (input.type === 'location') {
      if (!input.locationIds || input.locationIds.length === 0) {
        return errorResponse(400, 'MISSING_LOCATIONS', 'At least one location is required for location-based dashboards');
      }
      if (input.locationIds.length > 10) {
        return errorResponse(400, 'TOO_MANY_LOCATIONS', 'Maximum 10 locations allowed per dashboard');
      }
    }

    if (input.type === 'items') {
      if (!input.itemIds || input.itemIds.length === 0) {
        return errorResponse(400, 'MISSING_ITEMS', 'At least one item is required for item-based dashboards');
      }
      if (input.itemIds.length > 100) {
        return errorResponse(400, 'TOO_MANY_ITEMS', 'Maximum 100 items allowed per dashboard');
      }
    }

    logger.info('Creating dashboard', { familyId, memberId, type: input.type });

    const dashboard = await DashboardService.createDashboard({
      ...input,
      familyId,
      createdBy: memberId,
    });

    return successResponse(201, dashboard);
  } catch (error) {
    logger.error(
      'Error creating dashboard',
      error instanceof Error ? error : new Error('Unknown error')
    );

    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse(404, 'NOT_FOUND', error.message);
    }

    return errorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

/**
 * GET /api/dashboards/{dashboardId} - Get dashboard details
 * Requires admin authentication
 */
export async function getDashboard(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  // Handle warmup events
  if (handleWarmup(event, context)) {
    return successResponse({ message: 'Get dashboard handler warmed up' });
  }

  try {
    const authContext = await getAuthContext(event);
    const adminCheck = requireAdmin(authContext);
    if (adminCheck) {
      return adminCheck;
    }

    const dashboardId = event.pathParameters?.['dashboardId'];

    if (!dashboardId) {
      logger.warn('Missing dashboardId in path parameters');
      return errorResponse(400, 'MISSING_DASHBOARD_ID', 'Dashboard ID is required');
    }

    logger.info('Fetching dashboard', { dashboardId });

    const dashboard = await DashboardService.getDashboard(dashboardId);

    if (!dashboard) {
      logger.warn('Dashboard not found', { dashboardId });
      return errorResponse(404, 'NOT_FOUND', 'Dashboard not found');
    }

    return successResponse(dashboard);
  } catch (error) {
    logger.error(
      'Error fetching dashboard',
      error instanceof Error ? error : new Error('Unknown error')
    );

    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse(404, 'NOT_FOUND', 'Dashboard not found');
    }

    return errorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

/**
 * PATCH /api/dashboards/{dashboardId} - Update dashboard
 * Requires admin authentication
 */
export async function updateDashboard(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  // Handle warmup events
  if (handleWarmup(event, context)) {
    return successResponse({ message: 'Update dashboard handler warmed up' });
  }

  try {
    const authContext = await getAuthContext(event);
    const adminCheck = requireAdmin(authContext);
    if (adminCheck) {
      return adminCheck;
    }

    const { memberId } = authContext!;
    const dashboardId = event.pathParameters?.['dashboardId'];

    if (!dashboardId) {
      logger.warn('Missing dashboardId in path parameters');
      return errorResponse(400, 'MISSING_DASHBOARD_ID', 'Dashboard ID is required');
    }

    // Parse request body
    if (!event.body) {
      logger.warn('Missing request body');
      return errorResponse(400, 'MISSING_BODY', 'Request body is required');
    }

    let input: UpdateDashboardInput;
    try {
      input = JSON.parse(event.body) as UpdateDashboardInput;
    } catch (error) {
      logger.warn('Invalid JSON in request body', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return errorResponse(400, 'INVALID_JSON', 'Invalid request body');
    }

    // Validate input
    if (input.title !== undefined && input.title.trim().length === 0) {
      return errorResponse(400, 'EMPTY_TITLE', 'Dashboard title cannot be empty');
    }

    if (input.title !== undefined && input.title.length > 100) {
      return errorResponse(400, 'TITLE_TOO_LONG', 'Dashboard title must be 100 characters or less');
    }

    logger.info('Updating dashboard', { dashboardId, memberId });

    const dashboard = await DashboardService.updateDashboard({
      ...input,
      dashboardId,
      updatedBy: memberId,
    });

    return successResponse(dashboard);
  } catch (error) {
    logger.error(
      'Error updating dashboard',
      error instanceof Error ? error : new Error('Unknown error')
    );

    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse(404, 'NOT_FOUND', 'Dashboard not found');
    }

    return errorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

/**
 * DELETE /api/dashboards/{dashboardId} - Delete (deactivate) dashboard
 * Requires admin authentication
 */
export async function deleteDashboard(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  // Handle warmup events
  if (handleWarmup(event, context)) {
    return successResponse({ message: 'Delete dashboard handler warmed up' });
  }

  try {
    const authContext = await getAuthContext(event);
    const adminCheck = requireAdmin(authContext);
    if (adminCheck) {
      return adminCheck;
    }

    const { memberId } = authContext!;
    const dashboardId = event.pathParameters?.['dashboardId'];

    if (!dashboardId) {
      logger.warn('Missing dashboardId in path parameters');
      return errorResponse(400, 'MISSING_DASHBOARD_ID', 'Dashboard ID is required');
    }

    logger.info('Deleting dashboard', { dashboardId, memberId });

    await DashboardService.deleteDashboard(dashboardId, memberId);

    return successResponse({ message: 'Dashboard deleted successfully' });
  } catch (error) {
    logger.error(
      'Error deleting dashboard',
      error instanceof Error ? error : new Error('Unknown error')
    );

    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse(404, 'NOT_FOUND', 'Dashboard not found');
    }

    return errorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

/**
 * POST /api/dashboards/{dashboardId}/rotate - Rotate dashboard URL
 * Requires admin authentication
 */
export async function rotateDashboard(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  // Handle warmup events
  if (handleWarmup(event, context)) {
    return successResponse({ message: 'Rotate dashboard handler warmed up' });
  }

  try {
    const authContext = await getAuthContext(event);
    const adminCheck = requireAdmin(authContext);
    if (adminCheck) {
      return adminCheck;
    }

    const { memberId } = authContext!;
    const dashboardId = event.pathParameters?.['dashboardId'];

    if (!dashboardId) {
      logger.warn('Missing dashboardId in path parameters');
      return errorResponse(400, 'MISSING_DASHBOARD_ID', 'Dashboard ID is required');
    }

    logger.info('Rotating dashboard URL', { dashboardId, memberId });

    const result = await DashboardService.rotateDashboard(dashboardId, memberId);

    return successResponse(result);
  } catch (error) {
    logger.error(
      'Error rotating dashboard URL',
      error instanceof Error ? error : new Error('Unknown error')
    );

    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse(404, 'NOT_FOUND', 'Dashboard not found');
    }

    return errorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
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
  
  // GET /api/dashboards
  if (method === 'GET' && path === '/api/dashboards') {
    return listDashboards(event, context);
  }
  
  // POST /api/dashboards
  if (method === 'POST' && path === '/api/dashboards') {
    return createDashboard(event, context);
  }
  
  // GET /api/dashboards/{dashboardId}
  if (method === 'GET' && path.match(/^\/api\/dashboards\/[^/]+$/)) {
    return getDashboard(event, context);
  }
  
  // PATCH /api/dashboards/{dashboardId}
  if (method === 'PATCH' && path.match(/^\/api\/dashboards\/[^/]+$/)) {
    return updateDashboard(event, context);
  }
  
  // DELETE /api/dashboards/{dashboardId}
  if (method === 'DELETE' && path.match(/^\/api\/dashboards\/[^/]+$/)) {
    return deleteDashboard(event, context);
  }
  
  // POST /api/dashboards/{dashboardId}/rotate
  if (method === 'POST' && path.match(/^\/api\/dashboards\/[^/]+\/rotate$/)) {
    return rotateDashboard(event, context);
  }
  
  // Fallback
  return errorResponse(404, 'NOT_FOUND', 'Route not found');
};
