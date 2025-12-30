/**
 * Type definitions for NFC URL entity
 * 
 * @description NFCUrl maps cryptographically random URL IDs to inventory items,
 * enabling unauthenticated adjustments via NFC tag taps.
 * 
 * @see specs/006-api-integration/data-model.md for schema design
 */

/**
 * NFCUrl entity stored in DynamoDB
 * 
 * Single-table design extending InventoryManagement table:
 * - PK: FAMILY#{familyId}
 * - SK: ITEM#{itemId}#URL#{urlId}
 * - GSI1PK: URL#{urlId} (fast lookup by URL ID)
 * - GSI2PK: FAMILY#{familyId}#URLS (list all URLs for family)
 */
export interface NFCUrl {
  // Partition/Sort Keys
  PK: string;                    // FAMILY#{familyId}
  SK: string;                    // ITEM#{itemId}#URL#{urlId}
  
  // GSI Keys
  GSI1PK: string;                // URL#{urlId}
  GSI1SK: string;                // ITEM#{itemId}
  GSI2PK: string;                // FAMILY#{familyId}#URLS
  GSI2SK: string;                // CREATED#{createdAt}#URL#{urlId}
  
  // Entity Data
  entityType: 'NFCUrl';
  urlId: string;                 // Base62-encoded UUID (22 chars), e.g., "2gSZw8ZQPb7D5kN3X8mQ7"
  itemId: string;                // UUID of inventory item
  familyId: string;              // UUID of family
  itemName: string;              // Denormalized for fast display (cached)
  isActive: boolean;             // false if rotated/revoked
  createdAt: string;             // ISO 8601 timestamp
  createdBy: string;             // memberId who created URL
  lastAccessedAt?: string;       // ISO 8601 timestamp (updated on each tap)
  accessCount: number;           // Incremented on each access (for analytics)
  rotatedAt?: string;            // ISO 8601 timestamp when deactivated
  rotatedBy?: string;            // memberId who rotated URL
}

/**
 * Input for creating a new NFC URL
 */
export interface CreateNFCUrlInput {
  itemId: string;
  familyId: string;
  itemName: string;
  createdBy: string;
}

/**
 * Input for rotating (deactivating old, creating new) an NFC URL
 */
export interface RotateNFCUrlInput {
  urlId: string;
  familyId: string;
  rotatedBy: string;
}

/**
 * Input for adjusting inventory via NFC URL
 */
export interface AdjustInventoryViaUrlInput {
  urlId: string;
  delta: number;  // Any integer adjustment (accumulated from debouncing)
}

/**
 * Response from NFC URL validation
 */
export interface NFCUrlValidationResult {
  isValid: boolean;
  nfcUrl?: NFCUrl;
  errorCode?: 'NOT_FOUND' | 'INACTIVE' | 'ITEM_DELETED';
  errorMessage?: string;
}

/**
 * Response from inventory adjustment
 */
export interface AdjustmentResponse {
  success: boolean;
  itemId: string;
  itemName: string;
  newQuantity: number;
  message?: string;
  delta: number;  // Any integer adjustment (accumulated from debouncing)
  timestamp: string;
  errorCode?: 'URL_INVALID' | 'ITEM_NOT_FOUND' | 'FAMILY_MISMATCH';
  errorMessage?: string;
}

/**
 * Request body for NFC adjustment API
 */
export interface NfcAdjustmentRequest {
  delta: number;  // Any integer adjustment (accumulated from debouncing)
}

/**
 * Request body for creating NFC URL
 */
export interface CreateNfcUrlRequest {
  itemId: string;
}

/**
 * Response for NFC URL list
 */
export interface NfcUrlListResponse {
  urls: NFCUrl[];
  totalCount: number;
}
