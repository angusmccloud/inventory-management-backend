/**
 * Entity Type Definitions - Family Inventory Management System
 * 
 * All entities follow DynamoDB single-table design pattern.
 * Shared across backend Lambda functions for type safety.
 */

/**
 * Base entity with common attributes
 */
export interface BaseEntity {
  PK: string;
  SK: string;
  entityType: EntityType;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * Entity type discriminator
 */
export type EntityType = 
  | 'Family' 
  | 'Member' 
  | 'Invitation'
  | 'InventoryItem' 
  | 'StorageLocation' 
  | 'Store' 
  | 'ShoppingListItem' 
  | 'Notification' 
  | 'Suggestion'
  | 'CredentialVerificationTicket'
  | 'AuditLogEntry'
  | 'NotificationReceipt'
  | 'RateLimit';

/**
 * Member role within a family
 */
export type MemberRole = 'admin' | 'suggester';

/**
 * Member status
 */
export type MemberStatus = 'active' | 'removed';

/**
 * Inventory item status
 */
export type ItemStatus = 'active' | 'archived';

/**
 * Notification type
 */
export type NotificationType = 'low_stock' | 'system' | 'suggestion_response';

/**
 * Notification status
 */
export type NotificationStatus = 'unread' | 'read';

/**
 * Suggestion status
 */
export type SuggestionStatus = 'pending' | 'approved' | 'rejected';

/**
 * Suggestion type
 */
export type SuggestionType = 'add_to_shopping' | 'create_item';

/**
 * Family Entity - Root organizational unit
 */
export interface Family extends BaseEntity {
  familyId: string; // UUID
  name: string;
  createdBy: string; // memberId
  entityType: 'Family';
  GSI1PK?: string;
  GSI1SK?: string;
}

/**
 * Member Entity - User belonging to a family
 */
export interface Member extends BaseEntity {
  memberId: string; // UUID (Cognito sub)
  familyId: string; // UUID
  email: string;
  name: string;
  role: MemberRole;
  status: MemberStatus;
  isActive?: boolean; // Soft-delete flag for account removal workflows
  deletionRequestedAt?: string | null; // ISO timestamp when deletion confirmation is pending
  passwordUpdatedAt?: string; // ISO timestamp of last password change
  version: number; // Optimistic locking version (starts at 1)
  themePreference?: 'light' | 'dark' | 'auto'; // User's theme preference (optional, defaults to 'auto')
  // Notification preference matrix stored on the Member record.
  // Keys are of the form "{notificationType}:{channel}" and values are frequency enums.
  notificationPreferences?: Record<string, NotificationPreferenceValue>;
  // Quick opt-out for all email channels
  unsubscribeAllEmail?: boolean;
  // Member timezone (IANA) used to schedule digests
  timezone?: string;
  entityType: 'Member';
  GSI1PK?: string; // MEMBER#{memberId}
  GSI1SK?: string; // FAMILY#{familyId}
}

/**
 * Credential verification ticket action type
 */
export type CredentialActionType = 'email_change' | 'password_change' | 'delete_account';

/**
 * Credential verification ticket status
 */
export type CredentialTicketStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired';

/**
 * Credential Verification Ticket Entity
 */
export interface CredentialVerificationTicket extends BaseEntity {
  ticketId: string;
  familyId: string;
  memberId: string;
  actionType: CredentialActionType;
  status: CredentialTicketStatus;
  issuedAt: string;
  expiresAt: string;
  ttl: number;
  newEmail?: string;
  entityType: 'CredentialVerificationTicket';
}


/**
 * Audit Log Entry Entity
 */
export interface AuditLogEntry extends BaseEntity {
  auditId: string;
  familyId: string;
  memberId: string;
  action: string;
  details?: Record<string, unknown>;
  correlationId: string;
  entityType: 'AuditLogEntry';
}


/**
 * Notification Receipt Entity
 */
export interface NotificationReceipt extends BaseEntity {
  notificationId: string;
  familyId: string;
  memberId: string;
  type: 'EMAIL_CHANGE_NOTICE' | 'DELETION_RECEIPT';
  status: 'queued' | 'sent' | 'failed';
  payload?: Record<string, unknown>;
  sentAt?: string;
  entityType: 'NotificationReceipt';
}

/**
 * Rate Limit Record Entity
 */
export interface RateLimitRecord extends BaseEntity {
  memberId: string;
  action: string;
  windowStart: number;
  count: number;
  ttl: number;
  entityType: 'RateLimit';
}


/**
 * Frequency enum used by notification preferences
 */
export type Frequency = 'NONE' | 'IMMEDIATE' | 'DAILY' | 'WEEKLY';

export type NotificationPreferenceValue = Frequency | Frequency[];

/**
 * InventoryItem Entity - Tracked consumable good
 */
export interface InventoryItem extends BaseEntity {
  itemId: string; // UUID
  familyId: string; // UUID
  name: string;
  quantity: number;
  unit?: string; // Optional: "oz", "lbs", "count", etc.
  locationId?: string; // UUID reference to StorageLocation
  locationName?: string; // Denormalized for quick display
  preferredStoreId?: string; // UUID reference to Store
  preferredStoreName?: string; // Denormalized for quick display
  lowStockThreshold: number;
  status: ItemStatus;
  notes?: string;
  createdBy: string; // memberId
  lastModifiedBy: string; // memberId
  entityType: 'InventoryItem';
  GSI2PK?: string; // FAMILY#{familyId}#ITEMS
  GSI2SK?: string; // STATUS#{status}#QUANTITY#{paddedQuantity}
}

/**
 * StorageLocation Entity - Where items are stored
 */
export interface StorageLocation extends BaseEntity {
  locationId: string; // UUID
  familyId: string; // UUID
  name: string;
  description?: string;
  archived?: boolean; // Whether this location has been archived
  entityType: 'StorageLocation';
}

/**
 * Store Entity - Where items are purchased
 */
export interface Store extends BaseEntity {
  storeId: string; // UUID
  familyId: string; // UUID
  name: string;
  address?: string;
  notes?: string;
  archived?: boolean; // Whether this store has been archived
  entityType: 'Store';
}

/**
 * ShoppingListItem Entity - Items to purchase
 */
export interface ShoppingListItem extends BaseEntity {
  shoppingItemId: string; // UUID
  familyId: string; // UUID
  inventoryItemId?: string; // UUID reference to InventoryItem (optional for free-text items)
  itemName: string;
  quantity: number;
  unit?: string;
  storeId?: string; // UUID reference to preferred Store
  storeName?: string; // Denormalized for quick display
  isPurchased: boolean;
  addedBy: string; // memberId
  notes?: string;
  entityType: 'ShoppingListItem';
  GSI2PK?: string; // FAMILY#{familyId}#SHOPPING
  GSI2SK?: string; // STORE#{storeId}#PURCHASED#{isPurchased}
}

/**
 * Notification Entity - Alerts for family members
 */
export interface Notification extends BaseEntity {
  notificationId: string; // UUID
  familyId: string; // UUID
  recipientId: string; // memberId
  type: NotificationType;
  status: NotificationStatus;
  title: string;
  message: string;
  relatedItemId?: string; // UUID reference to related entity
  relatedItemType?: EntityType;
  entityType: 'Notification';
  GSI1PK?: string; // MEMBER#{recipientId}#NOTIFICATIONS
  GSI1SK?: string; // STATUS#{status}#CREATED#{createdAt}
}

/**
 * Suggestion Entity - Suggester requests for admin approval
 */
export interface Suggestion extends BaseEntity {
  suggestionId: string; // UUID
  familyId: string; // UUID
  suggestedBy: string; // memberId (must be suggester role)
  suggestedByName: string; // Snapshot of suggester name
  type: SuggestionType;
  status: SuggestionStatus;
  
  // For add_to_shopping type
  itemId: string | null; // UUID of existing InventoryItem
  itemNameSnapshot: string | null; // Snapshot of item name for orphan handling
  
  // For create_item type
  proposedItemName: string | null; // Name for new item (1-100 chars)
  proposedQuantity: number | null; // Quantity for new item (integer >= 0)
  proposedThreshold: number | null; // Threshold for new item (integer >= 0)
  
  // Optional notes
  notes: string | null; // Suggester notes (0-500 chars)
  rejectionNotes: string | null; // Admin rejection reason (0-500 chars)
  
  // Review information
  reviewedBy: string | null; // memberId of admin who reviewed
  reviewedAt: string | null; // ISO 8601 timestamp when reviewed
  
  // Optimistic locking
  version: number; // Starting at 1, incremented on each update
  
  entityType: 'Suggestion';
  GSI2PK?: string; // FAMILY#{familyId}#SUGGESTIONS
  GSI2SK?: string; // STATUS#{status}#CREATED#{createdAt}
}

/**
 * DynamoDB key construction helpers
 */
export const KeyBuilder = {
  family: (familyId: string) => ({
    PK: `FAMILY#${familyId}`,
    SK: `FAMILY#${familyId}`,
    GSI1PK: 'FAMILY',
    GSI1SK: `FAMILY#${familyId}`,
  }),
  
  member: (familyId: string, memberId: string) => ({
    PK: `FAMILY#${familyId}`,
    SK: `MEMBER#${memberId}`,
    GSI1PK: `MEMBER#${memberId}`,
    GSI1SK: `FAMILY#${familyId}`,
  }),
  
  credentialVerificationTicket: (familyId: string, ticketId: string) => ({
    PK: `FAMILY#${familyId}`,
    SK: `CREDENTIAL_TICKET#${ticketId}`,
  }),

  auditLogEntry: (familyId: string, auditId: string, createdAt: string) => ({
    PK: `FAMILY#${familyId}`,
    SK: `AUDIT#${createdAt}#${auditId}`,
  }),

  notificationReceipt: (familyId: string, notificationId: string) => ({
    PK: `FAMILY#${familyId}`,
    SK: `NOTIFICATION#${notificationId}`,
  }),

  rateLimit: (memberId: string, action: string, windowStart: number) => ({
    PK: `RATE#${memberId}`,
    SK: `ACTION#${action}#WINDOW#${windowStart}`,
  }),

  inventoryItem: (familyId: string, itemId: string, status: ItemStatus, quantity: number) => ({
    PK: `FAMILY#${familyId}`,
    SK: `ITEM#${itemId}`,
    GSI2PK: `FAMILY#${familyId}#ITEMS`,
    GSI2SK: `STATUS#${status}#QUANTITY#${String(quantity).padStart(10, '0')}`,
  }),
  
  storageLocation: (familyId: string, locationId: string) => ({
    PK: `FAMILY#${familyId}`,
    SK: `LOCATION#${locationId}`,
  }),
  
  store: (familyId: string, storeId: string) => ({
    PK: `FAMILY#${familyId}`,
    SK: `STORE#${storeId}`,
  }),
  
  shoppingListItem: (familyId: string, shoppingItemId: string, storeId: string, isPurchased: boolean) => ({
    PK: `FAMILY#${familyId}`,
    SK: `SHOPPING#${shoppingItemId}`,
    GSI2PK: `FAMILY#${familyId}#SHOPPING`,
    GSI2SK: `STORE#${storeId || 'NONE'}#PURCHASED#${isPurchased}`,
  }),
  
  notification: (familyId: string, notificationId: string, recipientId: string, status: NotificationStatus, createdAt: string) => ({
    PK: `FAMILY#${familyId}`,
    SK: `NOTIFICATION#${notificationId}`,
    GSI1PK: `MEMBER#${recipientId}#NOTIFICATIONS`,
    GSI1SK: `STATUS#${status}#CREATED#${createdAt}`,
  }),
  
  suggestion: (familyId: string, suggestionId: string, status: SuggestionStatus, createdAt: string) => ({
    PK: `FAMILY#${familyId}`,
    SK: `SUGGESTION#${suggestionId}`,
    GSI2PK: `FAMILY#${familyId}#SUGGESTIONS`,
    GSI2SK: `STATUS#${status}#CREATED#${createdAt}`,
  }),
};

/**
 * Input types for creating entities (without generated fields)
 */
export interface FamilyInput {
  name: string;
  createdBy: string; // memberId
}

export interface MemberInput {
  familyId: string;
  email: string;
  name: string;
  role: MemberRole;
  // Optional initial notification settings when creating a member
  notificationPreferences?: Record<string, NotificationPreferenceValue>;
  unsubscribeAllEmail?: boolean;
  timezone?: string;
}

export interface InventoryItemInput {
  familyId: string;
  name: string;
  quantity: number;
  unit?: string;
  locationId?: string;
  locationName?: string;
  preferredStoreId?: string;
  preferredStoreName?: string;
  lowStockThreshold: number;
  notes?: string;
  createdBy: string;
}

export interface StorageLocationInput {
  familyId: string;
  name: string;
  description?: string;
}

export interface StoreInput {
  familyId: string;
  name: string;
  address?: string;
  notes?: string;
}

export interface ShoppingListItemInput {
  familyId: string;
  inventoryItemId?: string;
  itemName: string;
  quantity: number;
  unit?: string;
  storeId?: string;
  storeName?: string;
  addedBy: string;
  notes?: string;
}

/**
 * Query pattern helpers
 */
export const QueryPatterns = {
  // Get all members of a family
  listMembers: (familyId: string) => ({
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `FAMILY#${familyId}`,
      ':sk': 'MEMBER#',
    },
  }),
  
  // Get all inventory items for a family
  listInventoryItems: (familyId: string) => ({
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `FAMILY#${familyId}`,
      ':sk': 'ITEM#',
    },
  }),
  
  // Query low stock items using GSI2
  queryLowStockItems: (familyId: string, maxQuantity: number) => ({
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :gsi2pk AND GSI2SK BETWEEN :minSk AND :maxSk',
    ExpressionAttributeValues: {
      ':gsi2pk': `FAMILY#${familyId}#ITEMS`,
      ':minSk': 'STATUS#active#QUANTITY#0000000000',
      ':maxSk': `STATUS#active#QUANTITY#${String(maxQuantity).padStart(10, '0')}`,
    },
  }),
  
  // Get member's families using GSI1
  getMemberFamilies: (memberId: string) => ({
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :gsi1pk',
    ExpressionAttributeValues: {
      ':gsi1pk': `MEMBER#${memberId}`,
    },
  }),
  
  // Get unread notifications for a member using GSI1
  getUnreadNotifications: (memberId: string) => ({
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :gsi1pk AND begins_with(GSI1SK, :gsi1sk)',
    ExpressionAttributeValues: {
      ':gsi1pk': `MEMBER#${memberId}#NOTIFICATIONS`,
      ':gsi1sk': 'STATUS#unread#',
    },
  }),
  
  // Get pending suggestions for a family using GSI2
  getPendingSuggestions: (familyId: string) => ({
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :gsi2pk AND begins_with(GSI2SK, :gsi2sk)',
    ExpressionAttributeValues: {
      ':gsi2pk': `FAMILY#${familyId}#SUGGESTIONS`,
      ':gsi2sk': 'STATUS#pending#',
    },
  }),
  
  // Get shopping list items by store using GSI2
  getShoppingListByStore: (familyId: string, storeId: string) => ({
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :gsi2pk AND begins_with(GSI2SK, :gsi2sk)',
    ExpressionAttributeValues: {
      ':gsi2pk': `FAMILY#${familyId}#SHOPPING`,
      ':gsi2sk': `STORE#${storeId}#`,
    },
  }),
};
