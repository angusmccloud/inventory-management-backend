/**
 * Dashboard Model
 * Feature: 014-inventory-dashboards
 * 
 * Handles DynamoDB operations for Dashboard entities.
 * Dashboard maps cryptographically random dashboard IDs to collections of inventory items,
 * enabling unauthenticated multi-item viewing and quantity adjustments.
 * 
 * Dashboard ID Format: {familyId}_{randomString}
 * This encoding eliminates need for GSI lookups (O(1) GetItem operation).
 */

import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient, getTableName } from '../lib/dynamodb';
import { logger } from '../lib/logger';
import { generateDashboardId } from '../lib/dashboardId';
import {
  Dashboard,
  CreateDashboardInput,
  UpdateDashboardInput,
} from '../types/dashboard';

const TABLE_NAME = getTableName();

/**
 * Dashboard Model
 * Handles DynamoDB operations for Dashboard entities
 */
export class DashboardModel {
  /**
   * Create a new dashboard
   * 
   * @param input - Create dashboard input with familyId, title, type, locations/items, createdBy
   * @returns Created Dashboard entity
   * @throws Error if validation fails or dashboard creation fails
   */
  static async create(input: CreateDashboardInput): Promise<Dashboard> {
    // Validate input
    this.validateDashboardConfig(input);
    
    const dashboardId = generateDashboardId(input.familyId);
    const now = new Date().toISOString();

    const dashboard: Dashboard = {
      // Main table keys
      PK: `FAMILY#${input.familyId}`,
      SK: `DASHBOARD#${dashboardId}`,
      
      // Entity data
      entityType: 'Dashboard',
      dashboardId,
      familyId: input.familyId,
      title: input.title,
      type: input.type,
      
      // Configuration based on type
      ...(input.type === 'location' && { locationIds: input.locationIds }),
      ...(input.type === 'items' && { itemIds: input.itemIds }),
      
      // Metadata
      isActive: true,
      createdAt: now,
      createdBy: input.createdBy,
      accessCount: 0,
      updatedAt: now,
      version: 1,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: dashboard,
          ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        })
      );

      logger.info('Dashboard created', { 
        dashboardId, 
        type: input.type,
        familyId: input.familyId 
      });
      
      return dashboard;
    } catch (error) {
      logger.error('Failed to create dashboard', error as Error, { input });
      throw error;
    }
  }

  /**
   * Get dashboard by dashboardId (O(1) lookup using familyId encoding)
   * 
   * @param dashboardId - Dashboard ID in format {familyId}_{randomString}
   * @returns Dashboard entity or null if not found or inactive
   */
  static async getById(dashboardId: string): Promise<Dashboard | null> {
    // Parse familyId from dashboardId for O(1) lookup
    const { familyId } = this.parseDashboardId(dashboardId);
    
    try {
      const result = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `FAMILY#${familyId}`,
            SK: `DASHBOARD#${dashboardId}`,
          },
        })
      );

      const dashboard = result.Item as Dashboard | undefined;
      
      // Return null for inactive dashboards
      if (dashboard && !dashboard.isActive) {
        logger.info('Dashboard is inactive', { dashboardId });
        return null;
      }

      return dashboard || null;
    } catch (error) {
      logger.error('Failed to get dashboard', error as Error, { dashboardId });
      throw error;
    }
  }

  /**
   * List all dashboards for a family
   * 
   * @param familyId - Family UUID
   * @param includeInactive - Whether to include inactive dashboards (default: false)
   * @returns Array of Dashboard entities
   */
  static async listByFamily(
    familyId: string,
    includeInactive: boolean = false
  ): Promise<Dashboard[]> {
    try {
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
          ExpressionAttributeValues: {
            ':pk': `FAMILY#${familyId}`,
            ':skPrefix': 'DASHBOARD#',
          },
        })
      );

      const dashboards = (result.Items as Dashboard[]) || [];
      
      // Filter out inactive dashboards if requested
      if (!includeInactive) {
        return dashboards.filter(d => d.isActive);
      }
      
      return dashboards;
    } catch (error) {
      logger.error('Failed to list dashboards', error as Error, { familyId });
      throw error;
    }
  }

  /**
   * Update dashboard configuration
   * 
   * @param input - Update dashboard input with dashboardId, title, locations/items, updatedBy
   * @returns Updated Dashboard entity
   * @throws Error if dashboard not found or update fails
   */
  static async update(input: UpdateDashboardInput): Promise<Dashboard> {
    const { familyId } = this.parseDashboardId(input.dashboardId);
    const now = new Date().toISOString();
    
    // Build update expression dynamically
    const setUpdates: string[] = [];
    const attributeNames: Record<string, string> = {};
    const attributeValues: Record<string, any> = {
      ':updatedAt': now,
      ':increment': 1,
    };
    
    if (input.title !== undefined) {
      setUpdates.push('#title = :title');
      attributeNames['#title'] = 'title';
      attributeValues[':title'] = input.title;
    }
    
    if (input.locationIds !== undefined) {
      setUpdates.push('locationIds = :locationIds');
      attributeValues[':locationIds'] = input.locationIds;
    }
    
    if (input.itemIds !== undefined) {
      setUpdates.push('itemIds = :itemIds');
      attributeValues[':itemIds'] = input.itemIds;
    }
    
    setUpdates.push('updatedAt = :updatedAt');
    setUpdates.push('#version = #version + :increment');
    attributeNames['#version'] = 'version';
    
    // Build update expression
    const updateExpression = `SET ${setUpdates.join(', ')}`;
    
    try {
      const result = await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `FAMILY#${familyId}`,
            SK: `DASHBOARD#${input.dashboardId}`,
          },
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: attributeNames,
          ExpressionAttributeValues: {
            ...attributeValues,
            ':true': true,
          },
          ConditionExpression: 'attribute_exists(PK) AND isActive = :true',
          ReturnValues: 'ALL_NEW',
        })
      );

      logger.info('Dashboard updated', { dashboardId: input.dashboardId });
      
      return result.Attributes as Dashboard;
    } catch (error) {
      logger.error('Failed to update dashboard', error as Error, { input });
      throw error;
    }
  }

  /**
   * Deactivate dashboard (soft delete)
   * 
   * @param dashboardId - Dashboard ID to deactivate
   * @param deletedBy - Member ID who deleted the dashboard
   * @returns Updated Dashboard entity
   */
  static async deactivate(dashboardId: string, deletedBy: string): Promise<Dashboard> {
    const { familyId } = this.parseDashboardId(dashboardId);
    const now = new Date().toISOString();
    
    try {
      const result = await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `FAMILY#${familyId}`,
            SK: `DASHBOARD#${dashboardId}`,
          },
          UpdateExpression: 'SET isActive = :false, deletedAt = :now, deletedBy = :deletedBy, updatedAt = :now, #version = #version + :increment',
          ExpressionAttributeNames: {
            '#version': 'version',
          },
          ExpressionAttributeValues: {
            ':false': false,
            ':true': true,
            ':now': now,
            ':deletedBy': deletedBy,
            ':increment': 1,
          },
          ConditionExpression: 'attribute_exists(PK) AND isActive = :true',
          ReturnValues: 'ALL_NEW',
        })
      );

      logger.info('Dashboard deactivated', { dashboardId });
      
      return result.Attributes as Dashboard;
    } catch (error) {
      logger.error('Failed to deactivate dashboard', error as Error, { dashboardId });
      throw error;
    }
  }

  /**
   * Increment access count and update last accessed timestamp
   * 
   * @param dashboardId - Dashboard ID to update
   */
  static async incrementAccessCount(dashboardId: string): Promise<void> {
    const { familyId } = this.parseDashboardId(dashboardId);
    const now = new Date().toISOString();
    
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `FAMILY#${familyId}`,
            SK: `DASHBOARD#${dashboardId}`,
          },
          UpdateExpression: 'SET lastAccessedAt = :now, accessCount = if_not_exists(accessCount, :zero) + :increment',
          ExpressionAttributeValues: {
            ':now': now,
            ':zero': 0,
            ':increment': 1,
            ':true': true,
          },
          ConditionExpression: 'attribute_exists(PK) AND isActive = :true',
        })
      );

      logger.info('Dashboard access recorded', { dashboardId });
    } catch (error) {
      // Log but don't throw - access tracking shouldn't block dashboard viewing
      logger.error('Failed to increment access count', error as Error, { dashboardId });
    }
  }

  /**
   * Validate dashboard configuration
   * 
   * @param input - Create or update dashboard input
   * @throws Error if validation fails
   */
  private static validateDashboardConfig(input: CreateDashboardInput): void {
    // Title validation
    if (!input.title || input.title.trim().length === 0) {
      throw new Error('Dashboard title is required');
    }
    if (input.title.length < 1 || input.title.length > 100) {
      throw new Error('Dashboard title must be between 1 and 100 characters');
    }
    
    // Type validation
    if (input.type !== 'location' && input.type !== 'items') {
      throw new Error('Dashboard type must be "location" or "items"');
    }
    
    // Configuration validation based on type
    if (input.type === 'location') {
      if (!input.locationIds || input.locationIds.length === 0) {
        throw new Error('Location-based dashboard must have at least 1 location');
      }
      if (input.locationIds.length > 10) {
        throw new Error('Location-based dashboard cannot have more than 10 locations');
      }
      if (input.itemIds) {
        throw new Error('Location-based dashboard cannot have itemIds');
      }
    } else {
      if (!input.itemIds || input.itemIds.length === 0) {
        throw new Error('Item-based dashboard must have at least 1 item');
      }
      if (input.itemIds.length > 100) {
        throw new Error('Item-based dashboard cannot have more than 100 items');
      }
      if (input.locationIds) {
        throw new Error('Item-based dashboard cannot have locationIds');
      }
    }
  }

  /**
   * Parse dashboard ID to extract familyId
   * 
   * @param dashboardId - Dashboard ID in format {familyId}_{randomString}
   * @returns Object with familyId and randomPart
   * @throws Error if dashboard ID format is invalid
   */
  private static parseDashboardId(dashboardId: string): { familyId: string; randomPart: string } {
    const parts = dashboardId.split('_');
    
    if (parts.length !== 2) {
      throw new Error('Invalid dashboard ID format');
    }
    
    const [familyId, randomPart] = parts;
    
    // Basic validation
    if (!familyId || !randomPart) {
      throw new Error('Invalid dashboard ID format');
    }
    
    return { familyId, randomPart };
  }
}
