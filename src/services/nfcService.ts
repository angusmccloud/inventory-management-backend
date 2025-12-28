/**
 * NFC Service
 * 
 * @description Business logic for NFC URL operations including
 * generation, validation, rotation, and inventory adjustment.
 * 
 * @see specs/006-api-integration/research.md for technical decisions
 */

import { NFCUrlModel } from '../models/nfcUrl';
import { InventoryItemModel } from '../models/inventory';
import { InventoryService } from './inventoryService';
import { logger } from '../lib/logger';
import {
  NFCUrl,
  CreateNFCUrlInput,
  RotateNFCUrlInput,
  AdjustInventoryViaUrlInput,
  NFCUrlValidationResult,
  AdjustmentResponse,
} from '../types/nfcUrl';

/**
 * NFC Service
 * Business logic layer for NFC URL operations
 */
export class NfcService {
  /**
   * Generate a new NFC URL for an inventory item
   * 
   * @param input - Create NFC URL input
   * @returns Newly created NFCUrl entity
   * @throws Error if item doesn't exist or creation fails
   */
  static async generateUrl(input: CreateNFCUrlInput): Promise<NFCUrl> {
    logger.info('Generating NFC URL', { itemId: input.itemId, familyId: input.familyId });

    // Verify item exists and belongs to family
    const item = await InventoryItemModel.getById(input.familyId, input.itemId);
    if (!item) {
      const error = new Error('Inventory item not found');
      logger.error('Cannot generate NFC URL for non-existent item', error, {
        itemId: input.itemId,
        familyId: input.familyId,
      });
      throw error;
    }

    // Verify item is active
    if (item.status !== 'active') {
      const error = new Error('Cannot generate NFC URL for archived item');
      logger.error('Attempted to generate URL for archived item', error, {
        itemId: input.itemId,
        status: item.status,
      });
      throw error;
    }

    // Create NFC URL with current item name (denormalization)
    const nfcUrl = await NFCUrlModel.create({
      ...input,
      itemName: item.name,
    });

    logger.info('NFC URL generated successfully', {
      urlId: nfcUrl.urlId,
      itemId: input.itemId,
      familyId: input.familyId,
    });

    return nfcUrl;
  }

  /**
   * Validate an NFC URL and check if it's active
   * 
   * @param urlId - URL ID to validate
   * @returns Validation result with NFCUrl entity if valid
   */
  static async validateUrl(urlId: string): Promise<NFCUrlValidationResult> {
    logger.debug('Validating NFC URL', { urlId });

    // Get URL by urlId (uses GSI1 for fast lookup)
    const nfcUrl = await NFCUrlModel.getByUrlId(urlId);

    if (!nfcUrl) {
      logger.warn('NFC URL not found', { urlId });
      return {
        isValid: false,
        errorCode: 'NOT_FOUND',
        errorMessage: 'NFC URL not found',
      };
    }

    // Check if URL is active
    if (!nfcUrl.isActive) {
      logger.warn('NFC URL is inactive', { urlId, rotatedAt: nfcUrl.rotatedAt });
      return {
        isValid: false,
        nfcUrl,
        errorCode: 'INACTIVE',
        errorMessage: 'This NFC URL has been deactivated. Please contact your family admin to get a new URL.',
      };
    }

    // Verify item still exists
    const item = await InventoryItemModel.getById(nfcUrl.familyId, nfcUrl.itemId);
    if (!item) {
      logger.warn('Item for NFC URL no longer exists', { urlId, itemId: nfcUrl.itemId });
      return {
        isValid: false,
        nfcUrl,
        errorCode: 'ITEM_DELETED',
        errorMessage: 'The inventory item for this NFC URL no longer exists.',
      };
    }

    logger.debug('NFC URL validated successfully', { urlId, itemId: nfcUrl.itemId });

    return {
      isValid: true,
      nfcUrl,
    };
  }

  /**
   * Adjust inventory quantity via NFC URL
   * 
   * Atomically adjusts quantity and tracks access.
   * Enforces minimum quantity of 0.
   * 
   * @param input - Adjustment input with urlId and delta (-1 or +1)
   * @returns Adjustment response with new quantity
   * @throws Error if validation fails or adjustment cannot be applied
   */
  static async adjustInventory(input: AdjustInventoryViaUrlInput): Promise<AdjustmentResponse> {
    const { urlId, delta } = input;
    logger.info('Adjusting inventory via NFC URL', { urlId, delta });

    // Validate URL
    const validation = await this.validateUrl(urlId);
    if (!validation.isValid || !validation.nfcUrl) {
      logger.warn('Cannot adjust inventory: invalid URL', { urlId, errorCode: validation.errorCode });
      return {
        success: false,
        itemId: '',
        itemName: '',
        newQuantity: 0,
        delta,
        timestamp: new Date().toISOString(),
        errorCode: validation.errorCode === 'NOT_FOUND' ? 'URL_INVALID' : 
                   validation.errorCode === 'INACTIVE' ? 'URL_INVALID' :
                   validation.errorCode === 'ITEM_DELETED' ? 'ITEM_NOT_FOUND' : 'URL_INVALID',
        errorMessage: validation.errorMessage,
      };
    }

    const nfcUrl = validation.nfcUrl;

    try {
      // Get current item state
      const item = await InventoryItemModel.getById(nfcUrl.familyId, nfcUrl.itemId);
      if (!item) {
        logger.error('Item not found during adjustment', new Error('Item not found'), { itemId: nfcUrl.itemId });
        return {
          success: false,
          itemId: nfcUrl.itemId,
          itemName: nfcUrl.itemName,
          newQuantity: 0,
          delta,
          timestamp: new Date().toISOString(),
          errorCode: 'ITEM_NOT_FOUND',
          errorMessage: 'Inventory item not found',
        };
      }

      // Use InventoryService to adjust quantity - this handles notification logic
      const updatedItem = await InventoryService.adjustQuantity(
        nfcUrl.familyId,
        nfcUrl.itemId,
        delta,
        'system:nfc'
      );

      // Increment access count (fire-and-forget, don't block response)
      NFCUrlModel.incrementAccessCount(nfcUrl.familyId, nfcUrl.itemId, urlId).catch((err) => {
        logger.error('Failed to increment access count', err, { urlId });
      });

      logger.info('Inventory adjusted via NFC', {
        urlId,
        itemId: nfcUrl.itemId,
        oldQuantity: item.quantity,
        newQuantity: updatedItem.quantity,
        delta,
      });

      return {
        success: true,
        itemId: nfcUrl.itemId,
        itemName: nfcUrl.itemName,
        newQuantity: updatedItem.quantity,
        message: `${nfcUrl.itemName} quantity updated to ${updatedItem.quantity}`,
        delta,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to adjust inventory via NFC', error as Error, { urlId, delta });
      throw error;
    }
  }

  /**
   * Rotate an NFC URL (deactivate old, create new)
   * 
   * @param input - Rotation input with urlId, familyId, rotatedBy
   * @returns New NFCUrl entity
   * @throws Error if old URL doesn't exist or rotation fails
   */
  static async rotateUrl(input: RotateNFCUrlInput): Promise<NFCUrl> {
    const { urlId, familyId, rotatedBy } = input;
    logger.info('Rotating NFC URL', { urlId, familyId, rotatedBy });

    // Get existing URL
    const existingUrl = await NFCUrlModel.getByUrlId(urlId);
    if (!existingUrl) {
      const error = new Error('NFC URL not found');
      logger.error('Cannot rotate non-existent URL', error, { urlId });
      throw error;
    }

    // Verify family matches
    if (existingUrl.familyId !== familyId) {
      const error = new Error('Family ID mismatch');
      logger.error('Family ID does not match URL', error, { urlId, familyId });
      throw error;
    }

    // Deactivate old URL
    await NFCUrlModel.deactivate(
      existingUrl.familyId,
      existingUrl.itemId,
      urlId,
      rotatedBy
    );

    // Get current item name (in case it changed)
    const item = await InventoryItemModel.getById(existingUrl.familyId, existingUrl.itemId);
    if (!item) {
      const error = new Error('Item no longer exists');
      logger.error('Cannot rotate URL for deleted item', error, { 
        urlId, 
        itemId: existingUrl.itemId 
      });
      throw error;
    }

    // Create new URL
    const newUrl = await NFCUrlModel.create({
      itemId: existingUrl.itemId,
      familyId: existingUrl.familyId,
      itemName: item.name,
      createdBy: rotatedBy,
    });

    logger.info('NFC URL rotated successfully', {
      oldUrlId: urlId,
      newUrlId: newUrl.urlId,
      itemId: existingUrl.itemId,
    });

    return newUrl;
  }

  /**
   * List all NFC URLs for an inventory item
   * 
   * @param familyId - Family UUID
   * @param itemId - Item UUID
   * @param includeInactive - Include deactivated URLs (default: false)
   * @returns Array of NFCUrl entities
   */
  static async listUrlsForItem(
    familyId: string,
    itemId: string,
    includeInactive = false
  ): Promise<NFCUrl[]> {
    logger.debug('Listing NFC URLs for item', { familyId, itemId, includeInactive });

    // Verify item exists
    const item = await InventoryItemModel.getById(familyId, itemId);
    if (!item) {
      const error = new Error('Inventory item not found');
      logger.error('Cannot list URLs for non-existent item', error, { familyId, itemId });
      throw error;
    }

    const urls = await NFCUrlModel.listByItem(familyId, itemId, includeInactive);

    logger.debug('NFC URLs retrieved', { 
      familyId, 
      itemId, 
      count: urls.length,
      activeCount: urls.filter(u => u.isActive).length,
    });

    return urls;
  }

  /**
   * List all NFC URLs for a family
   * 
   * @param familyId - Family UUID
   * @param includeInactive - Include deactivated URLs (default: false)
   * @returns Array of NFCUrl entities sorted by creation time
   */
  static async listUrlsForFamily(
    familyId: string,
    includeInactive = false
  ): Promise<NFCUrl[]> {
    logger.debug('Listing NFC URLs for family', { familyId, includeInactive });

    const urls = await NFCUrlModel.listByFamily(familyId, includeInactive);

    logger.debug('Family NFC URLs retrieved', { 
      familyId, 
      count: urls.length,
      activeCount: urls.filter(u => u.isActive).length,
    });

    return urls;
  }

  /**
   * Update item name in NFC URLs when inventory item name changes
   * 
   * Called by InventoryService when item name is updated.
   * 
   * @param familyId - Family UUID
   * @param itemId - Item UUID
   * @param newItemName - Updated item name
   * @returns Number of URLs updated
   */
  static async updateItemNameInUrls(
    familyId: string,
    itemId: string,
    newItemName: string
  ): Promise<number> {
    logger.info('Updating item name in NFC URLs', { familyId, itemId, newItemName });

    const count = await NFCUrlModel.updateItemName(familyId, itemId, newItemName);

    logger.info('Item name updated in NFC URLs', { familyId, itemId, count });

    return count;
  }

  /**
   * Get NFC URL details by urlId
   * 
   * Admin function to retrieve full URL details.
   * 
   * @param urlId - URL ID
   * @returns NFCUrl entity or null if not found
   */
  static async getUrlById(urlId: string): Promise<NFCUrl | null> {
    logger.debug('Getting NFC URL by ID', { urlId });

    const url = await NFCUrlModel.getByUrlId(urlId);

    if (!url) {
      logger.debug('NFC URL not found', { urlId });
      return null;
    }

    logger.debug('NFC URL retrieved', { urlId, itemId: url.itemId });

    return url;
  }
}
