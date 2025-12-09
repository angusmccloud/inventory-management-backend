/**
 * NotificationService - Family Inventory Management System
 *
 * Business logic for notification lifecycle management.
 * Handles low-stock notification creation, acknowledgment, and resolution.
 */

import {
  NotificationModel,
  LowStockNotification,
  LowStockNotificationInput,
  LowStockNotificationStatus,
} from '../models/notification.js';
import { logger } from '../lib/logger.js';

/**
 * Result of creating a low-stock notification
 */
export interface CreateNotificationResult {
  notification: LowStockNotification;
  isNew: boolean;
}

/**
 * NotificationService
 * Business logic for notification management
 */
export class NotificationService {
  /**
   * Create a low-stock notification for an item
   * If an active notification already exists for the item, returns the existing one
   */
  static async createLowStockNotification(
    input: LowStockNotificationInput
  ): Promise<CreateNotificationResult> {
    try {
      // Check if an active notification already exists for this item
      const existingNotification = await NotificationModel.findActiveByItemId(
        input.familyId,
        input.itemId
      );

      if (existingNotification) {
        logger.info('Active notification already exists for item', {
          notificationId: existingNotification.notificationId,
          familyId: input.familyId,
          itemId: input.itemId,
        });
        return { notification: existingNotification, isNew: false };
      }

      // Create new notification
      const notification = await NotificationModel.create(input);

      logger.info('Low-stock notification created', {
        notificationId: notification.notificationId,
        familyId: input.familyId,
        itemId: input.itemId,
        itemName: input.itemName,
        currentQuantity: input.currentQuantity,
        threshold: input.threshold,
      });

      return { notification, isNew: true };
    } catch (error) {
      logger.error('Failed to create low-stock notification', error as Error, { input });
      throw error;
    }
  }

  /**
   * Acknowledge a notification (admin action)
   * Changes status from 'active' to 'acknowledged'
   */
  static async acknowledgeNotification(
    familyId: string,
    notificationId: string
  ): Promise<LowStockNotification> {
    try {
      const notification = await NotificationModel.getById(familyId, notificationId);

      if (!notification) {
        throw new Error('Notification not found');
      }

      if (notification.status !== 'active') {
        throw new Error(`Cannot acknowledge notification with status '${notification.status}'`);
      }

      const updatedNotification = await NotificationModel.updateStatus(
        familyId,
        notificationId,
        'acknowledged'
      );

      logger.info('Notification acknowledged', {
        notificationId,
        familyId,
      });

      return updatedNotification;
    } catch (error) {
      logger.error('Failed to acknowledge notification', error as Error, {
        familyId,
        notificationId,
      });
      throw error;
    }
  }

  /**
   * Resolve a notification (automatic when quantity rises above threshold)
   * Changes status from 'active' or 'acknowledged' to 'resolved'
   */
  static async resolveNotification(
    familyId: string,
    notificationId: string
  ): Promise<LowStockNotification> {
    try {
      const notification = await NotificationModel.getById(familyId, notificationId);

      if (!notification) {
        throw new Error('Notification not found');
      }

      if (notification.status === 'resolved') {
        logger.info('Notification already resolved', { notificationId, familyId });
        return notification;
      }

      const updatedNotification = await NotificationModel.updateStatus(
        familyId,
        notificationId,
        'resolved'
      );

      logger.info('Notification resolved', {
        notificationId,
        familyId,
      });

      return updatedNotification;
    } catch (error) {
      logger.error('Failed to resolve notification', error as Error, {
        familyId,
        notificationId,
      });
      throw error;
    }
  }

  /**
   * Resolve all active notifications for a specific item
   * Called when item quantity rises above threshold
   */
  static async resolveNotificationsForItem(familyId: string, itemId: string): Promise<void> {
    try {
      await NotificationModel.resolveByItemId(familyId, itemId);
      logger.info('Resolved notifications for item', { familyId, itemId });
    } catch (error) {
      logger.error('Failed to resolve notifications for item', error as Error, {
        familyId,
        itemId,
      });
      throw error;
    }
  }

  /**
   * Get all active notifications for a family
   */
  static async getActiveNotifications(familyId: string): Promise<LowStockNotification[]> {
    try {
      return await NotificationModel.listActive(familyId);
    } catch (error) {
      logger.error('Failed to get active notifications', error as Error, { familyId });
      throw error;
    }
  }

  /**
   * Get all notifications for a family (optionally filtered by status)
   */
  static async getNotifications(
    familyId: string,
    status?: LowStockNotificationStatus
  ): Promise<LowStockNotification[]> {
    try {
      if (status) {
        return await NotificationModel.listByStatus(familyId, status);
      }
      return await NotificationModel.listByFamily(familyId);
    } catch (error) {
      logger.error('Failed to get notifications', error as Error, { familyId, status });
      throw error;
    }
  }

  /**
   * Get a single notification by ID
   */
  static async getNotification(
    familyId: string,
    notificationId: string
  ): Promise<LowStockNotification | null> {
    try {
      return await NotificationModel.getById(familyId, notificationId);
    } catch (error) {
      logger.error('Failed to get notification', error as Error, { familyId, notificationId });
      throw error;
    }
  }
}