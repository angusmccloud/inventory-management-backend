/**
 * Domain Configuration for Inventory HQ
 * 
 * Centralizes all domain-related constants and helper functions.
 * This ensures consistent domain usage across the application.
 */

/**
 * Primary domain for the application
 */
export const PRIMARY_DOMAIN = 'inventoryhg.io';

/**
 * Application name displayed in UI and emails
 */
export const APPLICATION_NAME = 'Inventory HQ';

/**
 * Base URL for the frontend application
 * Uses HTTPS protocol with the primary domain
 */
export const FRONTEND_BASE_URL = `https://${PRIMARY_DOMAIN}`;

/**
 * Email configuration
 */
export const EMAIL_CONFIG = {
  /**
   * Default sender email address for system-generated emails
   */
  fromAddress: `noreply@${PRIMARY_DOMAIN}`,
  
  /**
   * Display name for email sender
   */
  fromName: APPLICATION_NAME,
  
  /**
   * Reply-to address (if different from sender)
   */
  replyToAddress: `support@${PRIMARY_DOMAIN}`,
} as const;

/**
 * Subdomain configuration
 */
export const SUBDOMAINS = {
  www: `www.${PRIMARY_DOMAIN}`,
  api: `api.${PRIMARY_DOMAIN}`, // For future API Gateway custom domain
} as const;

/**
 * Helper function to construct full URLs for the frontend
 * 
 * @param path - The path to append to the base URL (should start with /)
 * @returns Full URL with the primary domain
 * 
 * @example
 * getFrontendUrl('/dashboard/inventory') // 'https://inventoryhg.io/dashboard/inventory'
 */
export function getFrontendUrl(path: string): string {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${FRONTEND_BASE_URL}${normalizedPath}`;
}

/**
 * Helper function to construct email addresses for the domain
 * 
 * @param localPart - The local part of the email address (before @)
 * @returns Full email address with the primary domain
 * 
 * @example
 * getEmailAddress('noreply') // 'noreply@inventoryhg.io'
 * getEmailAddress('support') // 'support@inventoryhg.io'
 */
export function getEmailAddress(localPart: string): string {
  return `${localPart}@${PRIMARY_DOMAIN}`;
}

/**
 * Helper function to validate if a URL belongs to the application domain
 * 
 * @param url - The URL to validate
 * @returns True if the URL uses the primary domain
 * 
 * @example
 * isApplicationUrl('https://inventoryhg.io/dashboard') // true
 * isApplicationUrl('https://example.com') // false
 */
export function isApplicationUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname === PRIMARY_DOMAIN || parsedUrl.hostname === SUBDOMAINS.www;
  } catch {
    return false;
  }
}

/**
 * Environment-specific configuration
 * Can be overridden via environment variables for local development
 */
export const getDomainConfig = () => {
  const envFrontendUrl = process.env['FRONTEND_URL'];
  const envFromEmail = process.env['SES_FROM_EMAIL'];
  
  return {
    frontendUrl: envFrontendUrl || FRONTEND_BASE_URL,
    fromEmail: envFromEmail || EMAIL_CONFIG.fromAddress,
    applicationName: APPLICATION_NAME,
    primaryDomain: PRIMARY_DOMAIN,
  };
};
