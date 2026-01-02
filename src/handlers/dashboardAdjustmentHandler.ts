import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DashboardService } from '../services/dashboardService';
import { successResponse, errorResponse } from '../lib/response';
import { handleWarmup } from '../lib/warmup';
import { AdjustQuantityInput } from '../types/dashboard';
import { logger } from '../lib/logger';

/**
 * POST /d/{dashboardId}/items/{itemId}/adjust - Adjust item quantity
 * No authentication required - public dashboard access
 */
export async function adjustItemQuantity(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  // Handle warmup events
  if (handleWarmup(event, context)) {
    return successResponse({ message: 'Dashboard adjustment handler warmed up' });
  }

  try {
    const dashboardId = event.pathParameters?.['dashboardId'];
    const itemId = event.pathParameters?.['itemId'];

    if (!dashboardId) {
      logger.warn('Missing dashboardId in path parameters');
      return errorResponse(400, 'MISSING_DASHBOARD_ID', 'Dashboard ID is required');
    }

    if (!itemId) {
      logger.warn('Missing itemId in path parameters');
      return errorResponse(400, 'MISSING_ITEM_ID', 'Item ID is required');
    }

    // Parse request body
    if (!event.body) {
      logger.warn('Missing request body');
      return errorResponse(400, 'MISSING_BODY', 'Request body is required');
    }

    let input: AdjustQuantityInput;
    try {
      input = JSON.parse(event.body) as AdjustQuantityInput;
    } catch (error) {
      logger.warn('Invalid JSON in request body', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return errorResponse(400, 'INVALID_JSON', 'Invalid request body');
    }

    // Validate adjustment value
    if (typeof input.adjustment !== 'number') {
      logger.warn('Invalid adjustment value', { adjustment: input.adjustment });
      return errorResponse(400, 'INVALID_ADJUSTMENT', 'Adjustment must be a number');
    }

    if (input.adjustment === 0) {
      logger.warn('Zero adjustment value');
      return errorResponse(400, 'ZERO_ADJUSTMENT', 'Adjustment cannot be zero');
    }

    // Validate adjustment is within reasonable bounds
    if (Math.abs(input.adjustment) > 10000) {
      logger.warn('Adjustment value too large', { adjustment: input.adjustment });
      return errorResponse(400, 'ADJUSTMENT_TOO_LARGE', 'Adjustment value is too large');
    }

    logger.info('Adjusting item quantity via dashboard', {
      dashboardId,
      itemId,
      adjustment: input.adjustment,
    });

    // Look up the dashboard to get the familyId
    const dashboard = await DashboardService.getDashboardPublic(dashboardId);

    if (!dashboard) {
      logger.warn('Dashboard not found', { dashboardId });
      return errorResponse(404, 'NOT_FOUND', 'Dashboard not found');
    }

    // Verify the item is part of this dashboard
    const itemExists = dashboard.items.some(item => item.itemId === itemId);
    if (!itemExists) {
      logger.warn('Item not found in dashboard', { dashboardId, itemId });
      return errorResponse(404, 'NOT_FOUND', 'Dashboard or item not found');
    }

    // Extract familyId from the dashboardId (format: familyId_randomString)
    const familyId = dashboardId.split('_')[0];

    if (!familyId) {
      logger.warn('Invalid dashboard ID format', { dashboardId });
      return errorResponse(400, 'INVALID_DASHBOARD_ID', 'Invalid dashboard ID format');
    }

    const result = await DashboardService.adjustItemQuantity(familyId, itemId, input.adjustment);

    return successResponse(result);
  } catch (error) {
    logger.error(
      'Error adjusting item quantity',
      error instanceof Error ? error : new Error('Unknown error')
    );

    // Handle specific error cases
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return errorResponse(404, 'NOT_FOUND', 'Dashboard or item not found');
      }

      if (error.message.includes('inactive')) {
        return errorResponse(410, 'INACTIVE', 'Dashboard is no longer active');
      }

      if (error.message.includes('negative quantity')) {
        return errorResponse(400, 'NEGATIVE_QUANTITY', 'Cannot reduce quantity below zero');
      }
    }

    return errorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

/**
 * Main handler export
 */
export const handler = adjustItemQuantity;
