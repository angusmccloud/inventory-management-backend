/**
 * Zod validation schemas for NFC URL requests
 * 
 * @description Runtime validation for API request bodies and parameters
 * to ensure type safety and proper error messages.
 * 
 * @see specs/006-api-integration/contracts/ for API specifications
 */

import { z } from 'zod';

/**
 * URL ID format: Base62-encoded UUID (22 characters)
 * Pattern: [A-Za-z0-9]{22}
 */
export const urlIdSchema = z
  .string()
  .length(22, 'URL ID must be exactly 22 characters')
  .regex(/^[A-Za-z0-9]{22}$/, 'URL ID must contain only alphanumeric characters');

/**
 * UUID format validation
 */
export const uuidSchema = z
  .string()
  .uuid('Invalid UUID format');

/**
 * ISO 8601 timestamp validation
 */
export const iso8601Schema = z
  .string()
  .datetime('Invalid ISO 8601 timestamp');

/**
 * Adjustment delta: Only +1 or -1 allowed
 */
export const deltaSchema = z
  .union([z.literal(-1), z.literal(1)])
  .describe('Adjustment delta must be -1 or 1');

/**
 * Request body for POST /api/adjust/{urlId}
 * 
 * @example
 * ```json
 * { "delta": -1 }
 * ```
 */
export const nfcAdjustmentRequestSchema = z.object({
  delta: deltaSchema,
});

export type NfcAdjustmentRequest = z.infer<typeof nfcAdjustmentRequestSchema>;

/**
 * Request body for POST /api/items/{itemId}/nfc-urls (create NFC URL)
 * 
 * @example
 * ```json
 * { "itemId": "d5e8f9a0-1234-4567-89ab-cdef01234567" }
 * ```
 */
export const createNfcUrlRequestSchema = z.object({
  itemId: uuidSchema,
});

export type CreateNfcUrlRequest = z.infer<typeof createNfcUrlRequestSchema>;

/**
 * Path parameters for /t/{urlId} (NFC page)
 */
export const nfcPageParamsSchema = z.object({
  urlId: urlIdSchema,
});

export type NfcPageParams = z.infer<typeof nfcPageParamsSchema>;

/**
 * Path parameters for /api/items/{itemId}/nfc-urls
 */
export const itemNfcUrlsParamsSchema = z.object({
  itemId: uuidSchema,
});

export type ItemNfcUrlsParams = z.infer<typeof itemNfcUrlsParamsSchema>;

/**
 * Path parameters for /api/items/{itemId}/nfc-urls/{urlId}/rotate
 */
export const rotateNfcUrlParamsSchema = z.object({
  itemId: uuidSchema,
  urlId: urlIdSchema,
});

export type RotateNfcUrlParams = z.infer<typeof rotateNfcUrlParamsSchema>;

/**
 * Validate and parse request body with Zod schema
 * 
 * @param schema - Zod schema to validate against
 * @param data - Request body to validate
 * @returns Parsed and validated data
 * @throws ZodError with validation details if invalid
 */
export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Safe validation that returns result object instead of throwing
 * 
 * @param schema - Zod schema to validate against
 * @param data - Request body to validate
 * @returns { success: true, data: T } or { success: false, error: ZodError }
 */
export function safeValidateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  return { success: false, error: result.error };
}
