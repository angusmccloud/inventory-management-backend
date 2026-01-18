import { BaseEntity } from '../types/entities';

/**
 * Minimal notification-related models used by services and handlers.
 * Kept intentionally small to satisfy compile-time imports for Phase 2.
 */

export interface DeliveryLedgerEntry {
  lastSentAt?: string | null; // ISO timestamp
  digestRunId?: string | null;
}

export interface NotificationEvent extends BaseEntity {
  notificationId: string;
  familyId: string;
  type: string; // e.g., LOW_STOCK, SUGGESTION
  status: 'ACTIVE' | 'RESOLVED';
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  sourceContext?: Record<string, unknown>;
  // delivery ledger keyed by "{channel}:{frequency}"
  deliveryLedger?: Record<string, DeliveryLedgerEntry>;
}

export interface DeliveryDigestRun extends BaseEntity {
  runId: string;
  jobType: 'IMMEDIATE' | 'DAILY' | 'WEEKLY';
  scheduledFor: string;
  startedAt?: string;
  completedAt?: string;
  targetUserCount?: number;
  emailSentCount?: number;
  skippedCount?: number;
}

export default {};
