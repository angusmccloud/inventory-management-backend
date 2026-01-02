/**
 * Dashboard Types
 * Feature: 014-inventory-dashboards
 * 
 * Defines TypeScript types for Dashboard entity and related view models.
 */

/**
 * Dashboard entity stored in DynamoDB
 */
export interface Dashboard {
  // Partition/Sort Keys
  PK: string;                    // FAMILY#{familyId}
  SK: string;                    // DASHBOARD#{dashboardId}
  
  // Entity Data
  entityType: 'Dashboard';
  dashboardId: string;           // Format: {familyId}_{randomString}
  familyId: string;              // UUID of family
  title: string;                 // Human-readable name (1-100 chars)
  type: 'location' | 'items';    // Dashboard type
  
  // Configuration (based on type)
  locationIds?: string[];        // For location-based: array of locationId UUIDs (1-10)
  itemIds?: string[];            // For item-based: array of itemId UUIDs (1-100)
  
  // Metadata
  isActive: boolean;             // false if rotated/deleted
  createdAt: string;             // ISO 8601 timestamp
  createdBy: string;             // memberId who created dashboard
  lastAccessedAt?: string;       // ISO 8601 timestamp (updated on each view)
  accessCount: number;           // Incremented on each access (for analytics)
  rotatedAt?: string;            // ISO 8601 timestamp when URL rotated
  rotatedBy?: string;            // memberId who rotated URL
  deletedAt?: string;            // ISO 8601 timestamp when deleted
  deletedBy?: string;            // memberId who deleted dashboard
  updatedAt: string;             // ISO 8601 timestamp of last modification
  
  // Version
  version: number;               // For optimistic locking
}

/**
 * Input for creating a new dashboard
 */
export interface CreateDashboardInput {
  familyId: string;
  title: string;
  type: 'location' | 'items';
  locationIds?: string[];
  itemIds?: string[];
  createdBy: string;
}

/**
 * Input for updating an existing dashboard
 */
export interface UpdateDashboardInput {
  dashboardId: string;
  title?: string;
  locationIds?: string[];
  itemIds?: string[];
  updatedBy: string;
}

/**
 * Public dashboard data (minimal fields for unauthenticated access)
 */
export interface PublicDashboard {
  dashboardId: string;
  title: string;
  type: 'location' | 'items';
  itemCount: number;
}

/**
 * Dashboard item view model (for dashboard display)
 */
export interface DashboardItem {
  itemId: string;
  name: string;
  quantity: number;
  unit?: string;
  locationId?: string;
  locationName?: string;
  lowStockThreshold?: number;
  isLowStock: boolean;
}

/**
 * Dashboard with items (for public access endpoint)
 */
export interface DashboardWithItems {
  dashboard: PublicDashboard;
  items: DashboardItem[];
}

/**
 * Dashboard list item (for admin UI)
 */
export interface DashboardListItem {
  dashboardId: string;
  title: string;
  type: 'location' | 'items';
  isActive: boolean;
  createdAt: string;
  lastAccessedAt?: string;
  accessCount: number;
}

/**
 * Quantity adjustment input
 */
export interface AdjustQuantityInput {
  dashboardId: string;
  itemId: string;
  adjustment: number;
}

/**
 * Quantity adjustment response
 */
export interface AdjustQuantityResponse {
  newQuantity: number;
  message: string;
}

/**
 * Dashboard rotation result
 */
export interface DashboardRotationResult {
  oldDashboardId: string;
  newDashboard: Dashboard;
}
