/**
 * DashboardService
 * Feature: 014-inventory-dashboards
 * 
 * Business logic for dashboard operations including creation, retrieval,
 * rotation, and item queries for location-based and item-based dashboards.
 */

import { QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, getTableName } from '../lib/dynamodb';
import { DashboardModel } from '../models/dashboard';
import { InventoryService } from './inventoryService';
import { logger } from '../lib/logger';
import {
  Dashboard,
  CreateDashboardInput,
  UpdateDashboardInput,
  DashboardItem,
  DashboardWithItems,
  PublicDashboard,
  AdjustQuantityResponse,
  DashboardRotationResult,
} from '../types/dashboard';
import { InventoryItem } from '../types/entities';

const TABLE_NAME = getTableName();

/**
 * DashboardService
 * Business logic for dashboard operations
 */
export class DashboardService {
  /**
   * Create a new dashboard
   * 
   * @param input - Create dashboard input
   * @returns Created Dashboard entity
   */
  static async createDashboard(input: CreateDashboardInput): Promise<Dashboard> {
    return await DashboardModel.create(input);
  }

  /**
   * Get dashboard with items for public access
   * 
   * @param dashboardId - Dashboard ID
   * @returns Dashboard with items or null if not found/inactive
   */
  static async getDashboardPublic(dashboardId: string): Promise<DashboardWithItems | null> {
    const dashboard = await DashboardModel.getById(dashboardId);
    
    if (!dashboard) {
      return null;
    }
    
    // Get items based on dashboard type
    const items = dashboard.type === 'location'
      ? await this.getLocationBasedItems(dashboard.familyId, dashboard.locationIds || [])
      : await this.getItemBasedItems(dashboard.familyId, dashboard.itemIds || []);
    
    // Build public dashboard response
    const publicDashboard: PublicDashboard = {
      dashboardId: dashboard.dashboardId,
      title: dashboard.title,
      type: dashboard.type,
      itemCount: items.length,
    };
    
    return {
      dashboard: publicDashboard,
      items,
    };
  }

  /**
   * Get items for location-based dashboard
   * 
   * @param familyId - Family UUID
   * @param locationIds - Array of location UUIDs
   * @returns Array of DashboardItem view models
   */
  static async getLocationBasedItems(
    familyId: string,
    locationIds: string[]
  ): Promise<DashboardItem[]> {
    if (locationIds.length === 0) {
      return [];
    }
    
    // Build dynamic filter for multiple locations
    const locationPlaceholders = locationIds.map((_, i) => `:loc${i}`).join(', ');
    const locationValues: Record<string, string> = {};
    locationIds.forEach((id, i) => {
      locationValues[`:loc${i}`] = id;
    });
    
    try {
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          FilterExpression: `locationId IN (${locationPlaceholders}) AND #status = :status`,
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':pk': `FAMILY#${familyId}`,
            ':sk': 'ITEM#',
            ':status': 'active',
            ...locationValues,
          },
        })
      );

      const inventoryItems = (result.Items as InventoryItem[]) || [];
      
      // Convert to DashboardItem view models and sort
      return inventoryItems
        .map(item => this.toDashboardItem(item))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      logger.error('Failed to get location-based items', error as Error, { 
        familyId, 
        locationIds 
      });
      throw error;
    }
  }

  /**
   * Get items for item-based dashboard
   * 
   * @param familyId - Family UUID
   * @param itemIds - Array of item UUIDs
   * @returns Array of DashboardItem view models
   */
  static async getItemBasedItems(
    familyId: string,
    itemIds: string[]
  ): Promise<DashboardItem[]> {
    if (itemIds.length === 0) {
      return [];
    }
    
    const keys = itemIds.map(itemId => ({
      PK: `FAMILY#${familyId}`,
      SK: `ITEM#${itemId}`,
    }));
    
    try {
      const result = await docClient.send(
        new BatchGetCommand({
          RequestItems: {
            [TABLE_NAME]: {
              Keys: keys,
            },
          },
        })
      );

      const inventoryItems = (result.Responses?.[TABLE_NAME] as InventoryItem[]) || [];
      
      // Filter active items, convert to DashboardItem, and sort
      return inventoryItems
        .filter(item => item.status === 'active')
        .map(item => this.toDashboardItem(item))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      logger.error('Failed to get item-based items', error as Error, { 
        familyId, 
        itemIds 
      });
      throw error;
    }
  }

  /**
   * Adjust item quantity from dashboard
   * Delegates to existing InventoryService to maintain consistency
   * 
   * @param familyId - Family UUID
   * @param itemId - Item UUID
   * @param adjustment - Quantity adjustment (positive or negative)
   * @returns Adjustment response with new quantity and message
   */
  static async adjustItemQuantity(
    familyId: string,
    itemId: string,
    adjustment: number
  ): Promise<AdjustQuantityResponse> {
    // Delegate to existing inventory service for atomic adjustment
    // Use 'dashboard' as the modifiedBy value for public dashboard adjustments
    const result = await InventoryService.adjustQuantity(
      familyId,
      itemId,
      adjustment,
      'dashboard'
    );
    
    // Build user-friendly message
    const action = adjustment > 0 ? 'Added' : 'Took';
    const absAdjustment = Math.abs(adjustment);
    const unit = result.unit || 'items';
    
    return {
      newQuantity: result.quantity,
      message: `${action} ${absAdjustment} ${result.name} — now ${result.quantity} ${unit}`,
    };
  }

  /**
   * List all dashboards for a family
   * 
   * @param familyId - Family UUID
   * @param includeInactive - Whether to include inactive dashboards
   * @returns Array of Dashboard entities
   */
  static async listDashboards(
    familyId: string,
    includeInactive: boolean = false
  ): Promise<Dashboard[]> {
    return await DashboardModel.listByFamily(familyId, includeInactive);
  }

  /**
   * Get dashboard details (admin access)
   * 
   * @param dashboardId - Dashboard ID
   * @returns Dashboard entity or null if not found
   */
  static async getDashboard(dashboardId: string): Promise<Dashboard | null> {
    return await DashboardModel.getById(dashboardId);
  }

  /**
   * Update dashboard configuration
   * 
   * @param input - Update dashboard input
   * @returns Updated Dashboard entity
   */
  static async updateDashboard(input: UpdateDashboardInput): Promise<Dashboard> {
    return await DashboardModel.update(input);
  }

  /**
   * Rotate dashboard URL (deactivate old, create new with same config)
   * 
   * @param dashboardId - Dashboard ID to rotate
   * @param rotatedBy - Member ID who rotated the URL
   * @returns Rotation result with old and new dashboard IDs
   */
  static async rotateDashboard(
    dashboardId: string,
    rotatedBy: string
  ): Promise<DashboardRotationResult> {
    // Get existing dashboard
    const oldDashboard = await DashboardModel.getById(dashboardId);
    
    if (!oldDashboard) {
      throw new Error('Dashboard not found');
    }
    
    if (!oldDashboard.isActive) {
      throw new Error('Dashboard is already inactive');
    }
    
    // Deactivate old dashboard
    await DashboardModel.deactivate(dashboardId, rotatedBy);
    
    // Create new dashboard with same configuration
    const newDashboard = await DashboardModel.create({
      familyId: oldDashboard.familyId,
      title: oldDashboard.title,
      type: oldDashboard.type,
      locationIds: oldDashboard.locationIds,
      itemIds: oldDashboard.itemIds,
      createdBy: rotatedBy,
    });
    
    logger.info('Dashboard URL rotated', { 
      oldDashboardId: dashboardId,
      newDashboardId: newDashboard.dashboardId,
    });
    
    return {
      oldDashboardId: dashboardId,
      newDashboard,
    };
  }

  /**
   * Delete dashboard (soft delete by deactivating)
   * 
   * @param dashboardId - Dashboard ID to delete
   * @param deletedBy - Member ID who deleted the dashboard
   * @returns Deactivated Dashboard entity
   */
  static async deleteDashboard(
    dashboardId: string,
    deletedBy: string
  ): Promise<Dashboard> {
    return await DashboardModel.deactivate(dashboardId, deletedBy);
  }

  /**
   * Record dashboard access (increment count, update timestamp)
   * 
   * @param dashboardId - Dashboard ID to record access for
   */
  static async recordAccess(dashboardId: string): Promise<void> {
    await DashboardModel.incrementAccessCount(dashboardId);
  }

  /**
   * Convert InventoryItem to DashboardItem view model
   * 
   * @param item - InventoryItem from database
   * @returns DashboardItem view model
   */
  private static toDashboardItem(item: InventoryItem): DashboardItem {
    const isLowStock = item.lowStockThreshold !== undefined && 
                       item.quantity <= item.lowStockThreshold;
    
    return {
      itemId: item.itemId,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      locationId: item.locationId,
      locationName: item.locationName,
      lowStockThreshold: item.lowStockThreshold,
      isLowStock,
    };
  }
}
