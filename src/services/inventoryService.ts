import { InventoryItemModel } from '../models/inventory';
import { StorageLocationModel } from '../models/location';
import { StoreModel } from '../models/store';
import { MemberModel } from '../models/member';
import { NotificationService } from './notificationService';
import { logger } from '../lib/logger';
import {
  InventoryItem,
  InventoryItemInput,
  StorageLocation,
  StorageLocationInput,
  Store,
  StoreInput,
} from '../types/entities';

/**
 * InventoryService
 * Business logic for inventory management
 */
export class InventoryService {
  /**
   * Helper method to trigger low-stock notification and email
   * @param item - The inventory item that is now low stock
   */
  private static async triggerLowStockNotification(item: InventoryItem): Promise<void> {
    try {
      // Create the notification
      const result = await NotificationService.createLowStockNotification({
        familyId: item.familyId,
        itemId: item.itemId,
        itemName: item.name,
        currentQuantity: item.quantity,
        threshold: item.lowStockThreshold,
      });

      if (!result.isNew) {
        // Notification already exists for this item, skip email
        logger.info('Low stock notification already exists, skipping email', {
          itemId: item.itemId,
          familyId: item.familyId,
          notificationId: result.notification.notificationId,
        });
        return;
      }

      // Get family name for email
      // const family = await FamilyModel.getById(item.familyId);
      // const familyName = family?.name || 'Your Family';

      // Get admin members to send email notifications
      const members = await MemberModel.listByFamily(item.familyId);
      const adminMembers = members.filter(
        (m) => m.role === 'admin' && m.status === 'active' && m.email
      );

      // Build recipients list
      const recipients = adminMembers.map((admin) => ({
        email: admin.email,
        name: admin.name,
      }));

      // Send email to all admins
      if (recipients.length > 0) {
        try {
          // TODO: Implement email service for low stock alerts
          // await emailService.sendLowStockAlert(recipients, {
          //   itemName: item.name,
          //   currentQuantity: item.quantity,
          //   threshold: item.lowStockThreshold,
          //   familyName,
          // });
          logger.info('Low stock email would be sent', { recipientCount: recipients.length });
        } catch (emailError) {
          // Log but don't fail the operation if email fails
          logger.error('Failed to send low stock emails', emailError as Error, {
            recipientCount: recipients.length,
            itemId: item.itemId,
          });
        }
      }

      logger.info('Low stock notification triggered', {
        itemId: item.itemId,
        notificationId: result.notification.notificationId,
        adminCount: adminMembers.length,
      });
    } catch (error) {
      // Log but don't fail the main operation
      logger.error('Failed to trigger low stock notification', error as Error, {
        itemId: item.itemId,
        familyId: item.familyId,
      });
    }
  }

  /**
   * Helper method to resolve low-stock notifications when quantity rises above threshold
   * @param item - The inventory item that is now above threshold
   */
  private static async resolveNotificationsIfAboveThreshold(item: InventoryItem): Promise<void> {
    try {
      // Only resolve if item is above threshold
      if (!InventoryItemModel.isLowStock(item)) {
        await NotificationService.resolveNotificationsForItem(item.familyId, item.itemId);
        logger.info('Low stock notifications resolved for item', {
          itemId: item.itemId,
          familyId: item.familyId,
        });
      }
    } catch (error) {
      // Log but don't fail the main operation
      logger.error('Failed to resolve low stock notifications', error as Error, {
        itemId: item.itemId,
        familyId: item.familyId,
      });
    }
  }

  /**
   * Create a new inventory item
   */
  static async createItem(input: InventoryItemInput): Promise<InventoryItem> {
    try {
      // Validate location if provided
      if (input.locationId) {
        const location = await StorageLocationModel.getById(input.familyId, input.locationId);
        if (!location) {
          throw new Error('Storage location not found');
        }
      }

      // Validate store if provided
      if (input.preferredStoreId) {
        const store = await StoreModel.getById(input.familyId, input.preferredStoreId);
        if (!store) {
          throw new Error('Store not found');
        }
      }

      const item = await InventoryItemModel.create(input);

      logger.info('Inventory item created', { 
        itemId: item.itemId, 
        familyId: item.familyId, 
        name: item.name 
      });

      return item;
    } catch (error) {
      logger.error('Failed to create inventory item', error as Error, { input });
      throw error;
    }
  }

  /**
   * Get an inventory item by ID
   */
  static async getItem(familyId: string, itemId: string): Promise<InventoryItem | null> {
    try {
      return await InventoryItemModel.getById(familyId, itemId);
    } catch (error) {
      logger.error('Failed to get inventory item', error as Error, { familyId, itemId });
      throw error;
    }
  }

  /**
   * List all inventory items for a family
   */
  static async listItems(familyId: string, includeArchived = false): Promise<InventoryItem[]> {
    try {
      return await InventoryItemModel.listByFamily(familyId, includeArchived);
    } catch (error) {
      logger.error('Failed to list inventory items', error as Error, { familyId });
      throw error;
    }
  }

  /**
   * Get low-stock items for a family
   */
  static async getLowStockItems(familyId: string): Promise<InventoryItem[]> {
    try {
      return await InventoryItemModel.queryLowStock(familyId);
    } catch (error) {
      logger.error('Failed to get low-stock items', error as Error, { familyId });
      throw error;
    }
  }

  /**
   * Update an inventory item
   */
  static async updateItem(
    familyId: string,
    itemId: string,
    updates: Partial<Omit<InventoryItem, 'itemId' | 'familyId' | 'createdBy' | 'entityType' | 'createdAt' | 'PK' | 'SK'>>,
    modifiedBy: string
  ): Promise<InventoryItem> {
    try {
      // Validate location if being updated
      if (updates.locationId) {
        const location = await StorageLocationModel.getById(familyId, updates.locationId);
        if (!location) {
          throw new Error('Storage location not found');
        }
      }

      // Validate store if being updated
      if (updates.preferredStoreId) {
        const store = await StoreModel.getById(familyId, updates.preferredStoreId);
        if (!store) {
          throw new Error('Store not found');
        }
      }

      const item = await InventoryItemModel.update(familyId, itemId, updates, modifiedBy);

      logger.info('Inventory item updated', { familyId, itemId, updates });

      // Check if item is now low stock and needs notification
      if (InventoryItemModel.isLowStock(item)) {
        logger.warn('Item is below threshold', {
          itemId: item.itemId,
          quantity: item.quantity,
          threshold: item.lowStockThreshold,
        });
        // Trigger notification creation (User Story 2)
        await this.triggerLowStockNotification(item);
      } else {
        // Check if we need to resolve any existing notifications
        await this.resolveNotificationsIfAboveThreshold(item);
      }

      return item;
    } catch (error) {
      logger.error('Failed to update inventory item', error as Error, { familyId, itemId, updates });
      throw error;
    }
  }

  /**
   * Adjust inventory item quantity
   */
  static async adjustQuantity(
    familyId: string,
    itemId: string,
    delta: number,
    modifiedBy: string
  ): Promise<InventoryItem> {
    try {
      const item = await InventoryItemModel.adjustQuantity(familyId, itemId, delta, modifiedBy);

      logger.info('Inventory quantity adjusted', {
        familyId,
        itemId,
        delta,
        newQuantity: item.quantity,
      });

      // Check if item is now low stock
      if (InventoryItemModel.isLowStock(item)) {
        logger.warn('Item is below threshold after adjustment', {
          itemId: item.itemId,
          quantity: item.quantity,
          threshold: item.lowStockThreshold,
        });
        // Trigger notification creation (User Story 2)
        await this.triggerLowStockNotification(item);
      } else {
        // Check if we need to resolve any existing notifications (quantity increased above threshold)
        await this.resolveNotificationsIfAboveThreshold(item);
      }

      return item;
    } catch (error) {
      logger.error('Failed to adjust inventory quantity', error as Error, { familyId, itemId, delta });
      throw error;
    }
  }

  /**
   * Archive an inventory item
   */
  static async archiveItem(
    familyId: string,
    itemId: string,
    modifiedBy: string
  ): Promise<InventoryItem> {
    try {
      const item = await InventoryItemModel.archive(familyId, itemId, modifiedBy);

      logger.info('Inventory item archived', { familyId, itemId });

      return item;
    } catch (error) {
      logger.error('Failed to archive inventory item', error as Error, { familyId, itemId });
      throw error;
    }
  }

  /**
   * Create a storage location
   */
  static async createLocation(input: StorageLocationInput): Promise<StorageLocation> {
    try {
      const location = await StorageLocationModel.create(input);

      logger.info('Storage location created', { 
        locationId: location.locationId, 
        familyId: location.familyId, 
        name: location.name 
      });

      return location;
    } catch (error) {
      logger.error('Failed to create storage location', error as Error, { input });
      throw error;
    }
  }

  /**
   * List storage locations for a family
   */
  static async listLocations(familyId: string): Promise<StorageLocation[]> {
    try {
      return await StorageLocationModel.listByFamily(familyId);
    } catch (error) {
      logger.error('Failed to list storage locations', error as Error, { familyId });
      throw error;
    }
  }

  /**
   * Update a storage location
   */
  static async updateLocation(
    familyId: string,
    locationId: string,
    updates: { name?: string; description?: string }
  ): Promise<StorageLocation> {
    try {
      return await StorageLocationModel.update(familyId, locationId, updates);
    } catch (error) {
      logger.error('Failed to update storage location', error as Error, { familyId, locationId, updates });
      throw error;
    }
  }

  /**
   * Delete a storage location
   */
  static async deleteLocation(familyId: string, locationId: string): Promise<void> {
    try {
      // In production, we should check if any items reference this location
      // and either prevent deletion or update those items
      await StorageLocationModel.delete(familyId, locationId);

      logger.info('Storage location deleted', { familyId, locationId });
    } catch (error) {
      logger.error('Failed to delete storage location', error as Error, { familyId, locationId });
      throw error;
    }
  }

  /**
   * Create a store
   */
  static async createStore(input: StoreInput): Promise<Store> {
    try {
      const store = await StoreModel.create(input);

      logger.info('Store created', { 
        storeId: store.storeId, 
        familyId: store.familyId, 
        name: store.name 
      });

      return store;
    } catch (error) {
      logger.error('Failed to create store', error as Error, { input });
      throw error;
    }
  }

  /**
   * List stores for a family
   */
  static async listStores(familyId: string): Promise<Store[]> {
    try {
      return await StoreModel.listByFamily(familyId);
    } catch (error) {
      logger.error('Failed to list stores', error as Error, { familyId });
      throw error;
    }
  }

  /**
   * Update a store
   */
  static async updateStore(
    familyId: string,
    storeId: string,
    updates: { name?: string; address?: string; notes?: string }
  ): Promise<Store> {
    try {
      return await StoreModel.update(familyId, storeId, updates);
    } catch (error) {
      logger.error('Failed to update store', error as Error, { familyId, storeId, updates });
      throw error;
    }
  }

  /**
   * Delete a store
   */
  static async deleteStore(familyId: string, storeId: string): Promise<void> {
    try {
      // In production, we should check if any items or shopping list items reference this store
      // and either prevent deletion or update those items
      await StoreModel.delete(familyId, storeId);

      logger.info('Store deleted', { familyId, storeId });
    } catch (error) {
      logger.error('Failed to delete store', error as Error, { familyId, storeId });
      throw error;
    }
  }
}
