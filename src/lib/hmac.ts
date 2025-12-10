/**
 * HMAC utility functions for token signing and validation
 * Feature: 003-member-management
 */

import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Generate HMAC-SHA256 signature for a given value
 */
export function generateHmacSignature(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

/**
 * Verify HMAC signature using timing-safe comparison
 * This prevents timing attacks by ensuring comparison takes constant time
 */
export function verifyHmacSignature(
  value: string,
  providedSignature: string,
  secret: string
): boolean {
  const expectedSignature = generateHmacSignature(value, secret);
  
  // Ensure both signatures are the same length
  if (providedSignature.length !== expectedSignature.length) {
    return false;
  }
  
  try {
    // Convert hex strings to buffers for timing-safe comparison
    const providedBuffer = Buffer.from(providedSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    
    // timingSafeEqual throws if lengths don't match, but we already checked
    return timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    // If conversion fails or any error occurs, signature is invalid
    return false;
  }
}

