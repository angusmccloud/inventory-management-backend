/**
 * Token Service - Generate and validate invitation tokens
 * Feature: 003-member-management
 * 
 * Token format: {uuid}.{hmac_signature}
 * Example: f47ac10b-58cc-4372-a567-0e02b2c3d479.abc123def456...
 */

import { randomUUID } from 'crypto';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { generateHmacSignature, verifyHmacSignature } from '../lib/hmac';
import { logger } from '../lib/logger';

const secretsClient = new SecretsManagerClient({ region: process.env['AWS_REGION'] || 'us-east-1' });

// Cache the HMAC secret in memory to avoid repeated API calls
let cachedSecret: string | null = null;
let warnedInlineSecret = false;

/**
 * Get HMAC secret from AWS Secrets Manager (with caching)
 */
async function getHmacSecret(): Promise<string> {
  if (cachedSecret) {
    return cachedSecret;
  }

  // Prefer explicit inline secret for non-production or emergency fallback
  const inlineSecret =
    process.env['INVITATION_HMAC_SECRET_VALUE'] ||
    process.env['INVITATION_HMAC_SECRET'];

  if (inlineSecret) {
    cachedSecret = inlineSecret;

    if (!warnedInlineSecret) {
      logger.warn('Using inline invitation HMAC secret from environment variable');
      warnedInlineSecret = true;
    }

    return cachedSecret;
  }

  const environment = process.env['NODE_ENV'] || 'dev';
  const secretName = process.env['INVITATION_HMAC_SECRET_NAME'] || `/inventory-mgmt/${environment}/invitation-hmac-secret`;

  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: secretName,
      })
    );

    if (!response.SecretString) {
      throw new Error('Secret value is empty');
    }

    cachedSecret = response.SecretString;
    logger.info('HMAC secret loaded from Secrets Manager', { secretName });
    return cachedSecret;
  } catch (error) {
    logger.error('Failed to load HMAC secret', error as Error, { secretName });
    throw new Error('Failed to load HMAC secret');
  }
}

/**
 * Generate a secure invitation token
 * Returns token in format: {uuid}.{signature}
 */
export async function generateToken(): Promise<{ token: string; uuid: string; signature: string }> {
  const uuid = randomUUID();
  const secret = await getHmacSecret();
  const signature = generateHmacSignature(uuid, secret);
  const token = `${uuid}.${signature}`;

  logger.debug('Token generated', { tokenLength: token.length });
  return { token, uuid, signature };
}

/**
 * Validate invitation token format and signature
 * Returns { valid: true, uuid } if valid, { valid: false, uuid: '' } if invalid
 */
export async function validateToken(token: string): Promise<{ valid: boolean; uuid: string }> {
  // Split token into UUID and signature
  const parts = token.split('.');
  if (parts.length !== 2) {
    logger.warn('Invalid token format - expected UUID.signature', { tokenLength: token.length });
    return { valid: false, uuid: '' };
  }

  const uuid = parts[0] || '';
  const providedSignature = parts[1] || '';

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(uuid)) {
    logger.warn('Invalid UUID format in token', { uuid });
    return { valid: false, uuid: '' };
  }

  // Validate signature length (HMAC-SHA256 hex = 64 characters)
  if (providedSignature.length !== 64) {
    logger.warn('Invalid signature length', { signatureLength: providedSignature.length });
    return { valid: false, uuid: '' };
  }

  // Verify HMAC signature
  try {
    const secret = await getHmacSecret();
    const valid = verifyHmacSignature(uuid, providedSignature, secret);

    if (!valid) {
      logger.warn('HMAC signature verification failed', { uuid: uuid.substring(0, 8) + '...' });
    }

    return { valid, uuid };
  } catch (error) {
    logger.error('Token validation error', error as Error);
    return { valid: false, uuid: '' };
  }
}

/**
 * Clear the cached secret (useful for testing)
 */
export function clearSecretCache(): void {
  cachedSecret = null;
}

