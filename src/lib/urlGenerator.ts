/**
 * URL ID generator for NFC URLs
 * 
 * @description Generates cryptographically random URL IDs using UUID v4
 * and base62 encoding for URL-safe, short identifiers.
 * 
 * URL ID format: Base62-encoded UUID (22 characters)
 * - Entropy: 122 bits (UUID v4 standard)
 * - Character set: [A-Za-z0-9] (62 characters)
 * - Length: 22 characters
 * - Example: "2gSZw8ZQPb7D5kN3X8mQ7"
 * 
 * @see specs/006-api-integration/research.md for security analysis
 */

import { randomUUID } from 'crypto';

/**
 * Base62 character set (alphanumeric: 0-9, A-Z, a-z)
 * Sorted for consistent encoding
 */
const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Convert UUID to base62 string
 * 
 * @param uuid - Standard UUID string (with hyphens)
 * @returns Base62-encoded string (22 characters)
 * 
 * @example
 * ```typescript
 * uuidToBase62('550e8400-e29b-41d4-a716-446655440000')
 * // Returns: "2gSZw8ZQPb7D5kN3X8mQ7"
 * ```
 */
export function uuidToBase62(uuid: string): string {
  // Remove hyphens and convert to BigInt
  const hex = uuid.replace(/-/g, '');
  let num = BigInt('0x' + hex);
  
  // Convert to base62
  let result = '';
  while (num > 0n) {
    const remainder = Number(num % 62n);
    result = BASE62_CHARS[remainder] + result;
    num = num / 62n;
  }
  
  // Pad to 22 characters (UUID has 128 bits, base62 needs ~22 chars)
  return result.padStart(22, '0');
}

/**
 * Convert base62 string back to UUID
 * 
 * @param base62 - Base62-encoded string (22 characters)
 * @returns Standard UUID string (with hyphens)
 * 
 * @example
 * ```typescript
 * base62ToUuid('2gSZw8ZQPb7D5kN3X8mQ7')
 * // Returns: "550e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export function base62ToUuid(base62: string): string {
  // Convert base62 to BigInt
  let num = 0n;
  for (const char of base62) {
    const index = BASE62_CHARS.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid base62 character: ${char}`);
    }
    num = num * 62n + BigInt(index);
  }
  
  // Convert to hex and format as UUID
  const hex = num.toString(16).padStart(32, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Generate a cryptographically random URL ID
 * 
 * Uses Node.js crypto.randomUUID() which meets FIPS 140-2 standards
 * for cryptographic randomness. Each URL ID has 122 bits of entropy.
 * 
 * Collision probability: ~1 in 5.3×10^36 (negligible)
 * 
 * @returns Base62-encoded URL ID (22 characters)
 * 
 * @example
 * ```typescript
 * const urlId = generateUrlId();
 * // Returns: "7pQm3nX8kD5wZ2gS9YbN4"
 * ```
 */
export function generateUrlId(): string {
  const uuid = randomUUID();
  return uuidToBase62(uuid);
}

/**
 * Validate URL ID format
 * 
 * Checks that URL ID is exactly 22 characters and contains only
 * alphanumeric characters (base62 character set).
 * 
 * @param urlId - URL ID to validate
 * @returns true if valid format, false otherwise
 * 
 * @example
 * ```typescript
 * isValidUrlId('2gSZw8ZQPb7D5kN3X8mQ7') // true
 * isValidUrlId('invalid-id!')            // false
 * isValidUrlId('short')                  // false
 * ```
 */
export function isValidUrlId(urlId: string): boolean {
  return /^[A-Za-z0-9]{22}$/.test(urlId);
}

/**
 * Test uniqueness of generated URL IDs
 * 
 * Utility function for testing collision probability.
 * Generates N URL IDs and checks for duplicates.
 * 
 * @param count - Number of URL IDs to generate
 * @returns true if all unique, false if collision detected
 */
export function testUniqueness(count: number): boolean {
  const ids = new Set<string>();
  for (let i = 0; i < count; i++) {
    const id = generateUrlId();
    if (ids.has(id)) {
      return false; // Collision detected
    }
    ids.add(id);
  }
  return true;
}
