/**
 * Dashboard ID Utilities
 * Feature: 014-inventory-dashboards
 * 
 * Generates and parses dashboard IDs with familyId encoding for O(1) lookups.
 * Format: {familyId}_{randomString}
 * Example: f47ac10b-58cc-4372-a567-0e02b2c3d479_7pQm3nX8kD5wZ2gS9YbN4
 */

import { randomUUID } from 'crypto';

/**
 * Base62 character set for encoding
 */
const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Convert UUID to base62 string
 * @param uuid - UUID v4 string (with or without hyphens)
 * @returns 22-character base62 string
 */
export function uuidToBase62(uuid: string): string {
  // Remove hyphens and convert to BigInt
  const hex = uuid.replace(/-/g, '');
  const decimal = BigInt(`0x${hex}`);
  
  // Convert to base62
  let result = '';
  let value = decimal;
  
  while (value > 0n) {
    const remainder = Number(value % 62n);
    result = BASE62_CHARS[remainder] + result;
    value = value / 62n;
  }
  
  // Pad to 22 characters
  return result.padStart(22, '0');
}

/**
 * Generate a new dashboard ID with familyId encoding
 * @param familyId - Family UUID
 * @returns Dashboard ID in format {familyId}_{randomString}
 */
export function generateDashboardId(familyId: string): string {
  const randomPart = uuidToBase62(randomUUID());
  return `${familyId}_${randomPart}`;
}

/**
 * Parse dashboard ID to extract familyId and random parts
 * @param dashboardId - Dashboard ID to parse
 * @returns Object with familyId and randomPart
 * @throws Error if dashboard ID format is invalid
 */
export function parseDashboardId(dashboardId: string): { familyId: string; randomPart: string } {
  const parts = dashboardId.split('_');
  
  if (parts.length !== 2) {
    throw new Error('Invalid dashboard ID format: must contain exactly one underscore');
  }
  
  const familyId = parts[0];
  const randomPart = parts[1];
  
  if (!familyId || !randomPart) {
    throw new Error('Invalid dashboard ID format: missing familyId or random part');
  }
  
  // Validate familyId format (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(familyId)) {
    throw new Error('Invalid dashboard ID format: familyId is not a valid UUID');
  }
  
  // Validate randomPart length (should be 22 chars)
  if (randomPart.length !== 22) {
    throw new Error('Invalid dashboard ID format: random part must be 22 characters');
  }
  
  // Validate randomPart characters (base62)
  const base62Regex = /^[0-9A-Za-z]{22}$/;
  if (!base62Regex.test(randomPart)) {
    throw new Error('Invalid dashboard ID format: random part contains invalid characters');
  }
  
  return { familyId, randomPart };
}

/**
 * Validate dashboard ID format
 * @param dashboardId - Dashboard ID to validate
 * @returns true if valid, false otherwise
 */
export function isValidDashboardId(dashboardId: string): boolean {
  try {
    parseDashboardId(dashboardId);
    return true;
  } catch {
    return false;
  }
}
