/**
 * NotificationService Unit Tests
 *
 * Tests for the NotificationService business logic.
 * Mocks the NotificationModel to isolate service layer testing.
 */

import { NotificationService } from '../../src/services/notificationService';
import {
  NotificationModel,
  LowStockNotification,
  LowStockNotificationInput,
} from '../../src/models/notification';

// Mock the NotificationModel
jest.mock('../../src/models/notification');

// Mock the logger to prevent console output during tests
jest.mock('../../src/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('NotificationService', () => {
  // Reset all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createLowStockNotification', () => {
    const mockInput: LowStockNotificationInput = {
      familyId: 'family-123',
      itemId: 'item-456',
      itemName: 'Test Item',
      currentQuantity: 2,
      threshold: 5,
    };

    const mockNotification: LowStockNotification = {
      PK: 'FAMILY#family-123',
      SK: 'NOTIFICATION#notif-789',
      GSI2PK: 'FAMILY#family-123#NOTIFICATIONS',
      GSI2SK: 'STATUS#active#CREATED#2024-01-01T00:00:00.000Z',
      notificationId: 'notif-789',
      familyId: 'family-123',
      itemId: 'item-456',
      itemName: 'Test Item',
      type: 'low_stock',
      status: 'active',
      currentQuantity: 2,
      threshold: 5,
      entityType: 'Notification',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      resolvedAt: null,
    };

    it('should create a new notification when none exists', async () => {
      // Arrange
      (NotificationModel.findActiveByItemId as jest.Mock).mockResolvedValue(null);
      (NotificationModel.create as jest.Mock).mockResolvedValue(mockNotification);

      // Act
      const result = await NotificationService.createLowStockNotification(mockInput);

      // Assert
      expect(result.isNew).toBe(true);
      expect(result.notification).toEqual(mockNotification);
      expect(NotificationModel.findActiveByItemId).toHaveBeenCalledWith(
        mockInput.familyId,
        mockInput.itemId
      );
      expect(NotificationModel.create).toHaveBeenCalledWith(mockInput);
    });

    it('should return existing notification when one already exists', async () => {
      // Arrange
      (NotificationModel.findActiveByItemId as jest.Mock).mockResolvedValue(mockNotification);

      // Act
      const result = await NotificationService.createLowStockNotification(mockInput);

      // Assert
      expect(result.isNew).toBe(false);
      expect(result.notification).toEqual(mockNotification);
      expect(NotificationModel.findActiveByItemId).toHaveBeenCalledWith(
        mockInput.familyId,
        mockInput.itemId
      );
      expect(NotificationModel.create).not.toHaveBeenCalled();
    });

    it('should throw error when model operation fails', async () => {
      // Arrange
      const error = new Error('Database error');
      (NotificationModel.findActiveByItemId as jest.Mock).mockRejectedValue(error);

      // Act & Assert
      await expect(NotificationService.createLowStockNotification(mockInput)).rejects.toThrow(
        'Database error'
      );
    });
  });

  describe('acknowledgeNotification', () => {
    const familyId = 'family-123';
    const notificationId = 'notif-789';

    const mockActiveNotification: LowStockNotification = {
      PK: 'FAMILY#family-123',
      SK: 'NOTIFICATION#notif-789',
      GSI2PK: 'FAMILY#family-123#NOTIFICATIONS',
      GSI2SK: 'STATUS#active#CREATED#2024-01-01T00:00:00.000Z',
      notificationId: 'notif-789',
      familyId: 'family-123',
      itemId: 'item-456',
      itemName: 'Test Item',
      type: 'low_stock',
      status: 'active',
      currentQuantity: 2,
      threshold: 5,
      entityType: 'Notification',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      resolvedAt: null,
    };

    const mockAcknowledgedNotification: LowStockNotification = {
      ...mockActiveNotification,
      status: 'acknowledged',
      GSI2SK: 'STATUS#acknowledged#CREATED#2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    };

    it('should acknowledge an active notification', async () => {
      // Arrange
      (NotificationModel.getById as jest.Mock).mockResolvedValue(mockActiveNotification);
      (NotificationModel.updateStatus as jest.Mock).mockResolvedValue(mockAcknowledgedNotification);

      // Act
      const result = await NotificationService.acknowledgeNotification(familyId, notificationId);

      // Assert
      expect(result.status).toBe('acknowledged');
      expect(NotificationModel.getById).toHaveBeenCalledWith(familyId, notificationId);
      expect(NotificationModel.updateStatus).toHaveBeenCalledWith(
        familyId,
        notificationId,
        'acknowledged'
      );
    });

    it('should throw error when notification not found', async () => {
      // Arrange
      (NotificationModel.getById as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        NotificationService.acknowledgeNotification(familyId, notificationId)
      ).rejects.toThrow('Notification not found');
    });

    it('should throw error when notification is not active', async () => {
      // Arrange
      const resolvedNotification = { ...mockActiveNotification, status: 'resolved' as const };
      (NotificationModel.getById as jest.Mock).mockResolvedValue(resolvedNotification);

      // Act & Assert
      await expect(
        NotificationService.acknowledgeNotification(familyId, notificationId)
      ).rejects.toThrow("Cannot acknowledge notification with status 'resolved'");
    });
  });

  describe('getActiveNotifications', () => {
    const familyId = 'family-123';

    it('should return active notifications for a family', async () => {
      // Arrange
      const mockNotifications: LowStockNotification[] = [
        {
          PK: 'FAMILY#family-123',
          SK: 'NOTIFICATION#notif-1',
          GSI2PK: 'FAMILY#family-123#NOTIFICATIONS',
          GSI2SK: 'STATUS#active#CREATED#2024-01-01T00:00:00.000Z',
          notificationId: 'notif-1',
          familyId: 'family-123',
          itemId: 'item-1',
          itemName: 'Item 1',
          type: 'low_stock',
          status: 'active',
          currentQuantity: 1,
          threshold: 5,
          entityType: 'Notification',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          resolvedAt: null,
        },
      ];
      (NotificationModel.listActive as jest.Mock).mockResolvedValue(mockNotifications);

      // Act
      const result = await NotificationService.getActiveNotifications(familyId);

      // Assert
      expect(result).toEqual(mockNotifications);
      expect(NotificationModel.listActive).toHaveBeenCalledWith(familyId);
    });

    it('should return empty array when no active notifications', async () => {
      // Arrange
      (NotificationModel.listActive as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await NotificationService.getActiveNotifications(familyId);

      // Assert
      expect(result).toEqual([]);
    });
  });
});