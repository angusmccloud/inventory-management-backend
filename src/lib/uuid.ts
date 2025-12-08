/**
 * UUID Generator Utility - Family Inventory Management System
 * 
 * Provides UUID v4 generation for entity identifiers.
 * Uses crypto.randomUUID() which is available in Node.js 20.x runtime.
 */

import { randomUUID } from 'crypto';

/**
 * Generate a new UUID v4
 * 
 * Uses Node.js crypto.randomUUID() which provides cryptographically
 * strong random values conforming to RFC 4122 version 4.
 * 
 * @returns {string} A UUID v4 string (e.g., "550e8400-e29b-41d4-a716-446655440000")
 * 
 * @example
 * const familyId = generateUUID();
 * // Returns: "f47ac10b-58cc-4372-a567-0e02b2c3d479"
 */
export const generateUUID = (): string => {
  return randomUUID();
};

/**
 * Validate UUID v4 format
 * 
 * @param {string} uuid - The string to validate
 * @returns {boolean} True if the string is a valid UUID v4
 * 
 * @example
 * isValidUUID("550e8400-e29b-41d4-a716-446655440000"); // true
 * isValidUUID("not-a-uuid"); // false
 */
export const isValidUUID = (uuid: string): boolean => {
  const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidV4Regex.test(uuid);
};

/**
 * Generate multiple UUIDs at once
 * 
 * @param {number} count - Number of UUIDs to generate
 * @returns {string[]} Array of UUID v4 strings
 * 
 * @example
 * const [id1, id2, id3] = generateMultipleUUIDs(3);
 */
export const generateMultipleUUIDs = (count: number): string[] => {
  if (count < 1) {
    throw new Error('Count must be at least 1');
  }
  
  return Array.from({ length: count }, () => generateUUID());
};
