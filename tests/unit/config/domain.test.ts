import {
  PRIMARY_DOMAIN,
  APPLICATION_NAME,
  FRONTEND_BASE_URL,
  EMAIL_CONFIG,
  SUBDOMAINS,
  getFrontendUrl,
  getEmailAddress,
  isApplicationUrl,
  getDomainConfig,
} from '../../../src/config/domain';

describe('Domain Configuration', () => {
  describe('Constants', () => {
    it('should have correct primary domain', () => {
      expect(PRIMARY_DOMAIN).toBe('inventoryhg.io');
    });

    it('should have correct application name', () => {
      expect(APPLICATION_NAME).toBe('Inventory HQ');
    });

    it('should have correct frontend base URL', () => {
      expect(FRONTEND_BASE_URL).toBe('https://inventoryhg.io');
    });

    it('should have correct email configuration', () => {
      expect(EMAIL_CONFIG.fromAddress).toBe('noreply@inventoryhg.io');
      expect(EMAIL_CONFIG.fromName).toBe('Inventory HQ');
      expect(EMAIL_CONFIG.replyToAddress).toBe('support@inventoryhg.io');
    });

    it('should have correct subdomain configuration', () => {
      expect(SUBDOMAINS.www).toBe('www.inventoryhg.io');
      expect(SUBDOMAINS.api).toBe('api.inventoryhg.io');
    });
  });

  describe('getFrontendUrl', () => {
    it('should construct URL with leading slash', () => {
      const url = getFrontendUrl('/dashboard/inventory');
      expect(url).toBe('https://inventoryhg.io/dashboard/inventory');
    });

    it('should add leading slash if missing', () => {
      const url = getFrontendUrl('dashboard/inventory');
      expect(url).toBe('https://inventoryhg.io/dashboard/inventory');
    });

    it('should handle root path', () => {
      const url = getFrontendUrl('/');
      expect(url).toBe('https://inventoryhg.io/');
    });

    it('should handle empty path', () => {
      const url = getFrontendUrl('');
      expect(url).toBe('https://inventoryhg.io/');
    });

    it('should handle paths with query parameters', () => {
      const url = getFrontendUrl('/accept-invitation?token=abc123');
      expect(url).toBe('https://inventoryhg.io/accept-invitation?token=abc123');
    });

    it('should handle paths with hash fragments', () => {
      const url = getFrontendUrl('/dashboard#inventory');
      expect(url).toBe('https://inventoryhg.io/dashboard#inventory');
    });
  });

  describe('getEmailAddress', () => {
    it('should construct email address with local part', () => {
      const email = getEmailAddress('noreply');
      expect(email).toBe('noreply@inventoryhg.io');
    });

    it('should construct support email address', () => {
      const email = getEmailAddress('support');
      expect(email).toBe('support@inventoryhg.io');
    });

    it('should construct custom email address', () => {
      const email = getEmailAddress('admin');
      expect(email).toBe('admin@inventoryhg.io');
    });

    it('should handle email addresses with dots', () => {
      const email = getEmailAddress('no.reply');
      expect(email).toBe('no.reply@inventoryhg.io');
    });

    it('should handle email addresses with dashes', () => {
      const email = getEmailAddress('do-not-reply');
      expect(email).toBe('do-not-reply@inventoryhg.io');
    });
  });

  describe('isApplicationUrl', () => {
    it('should return true for primary domain URL', () => {
      const result = isApplicationUrl('https://inventoryhg.io/dashboard');
      expect(result).toBe(true);
    });

    it('should return true for www subdomain URL', () => {
      const result = isApplicationUrl('https://www.inventoryhg.io/dashboard');
      expect(result).toBe(true);
    });

    it('should return true for root domain URL', () => {
      const result = isApplicationUrl('https://inventoryhg.io');
      expect(result).toBe(true);
    });

    it('should return true for URL with query parameters', () => {
      const result = isApplicationUrl('https://inventoryhg.io/accept?token=abc');
      expect(result).toBe(true);
    });

    it('should return false for different domain', () => {
      const result = isApplicationUrl('https://example.com/dashboard');
      expect(result).toBe(false);
    });

    it('should return false for different TLD', () => {
      const result = isApplicationUrl('https://inventoryhg.com/dashboard');
      expect(result).toBe(false);
    });

    it('should return false for localhost', () => {
      const result = isApplicationUrl('http://localhost:3000/dashboard');
      expect(result).toBe(false);
    });

    it('should return false for invalid URL', () => {
      const result = isApplicationUrl('not-a-valid-url');
      expect(result).toBe(false);
    });

    it('should handle http protocol for primary domain', () => {
      const result = isApplicationUrl('http://inventoryhg.io/dashboard');
      expect(result).toBe(true);
    });
  });

  describe('getDomainConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should return default configuration when no env variables set', () => {
      delete process.env.FRONTEND_URL;
      delete process.env.SES_FROM_EMAIL;

      const config = getDomainConfig();

      expect(config.frontendUrl).toBe('https://inventoryhg.io');
      expect(config.fromEmail).toBe('noreply@inventoryhg.io');
      expect(config.applicationName).toBe('Inventory HQ');
      expect(config.primaryDomain).toBe('inventoryhg.io');
    });

    it('should use FRONTEND_URL env variable when set', () => {
      process.env.FRONTEND_URL = 'http://localhost:3000';

      const config = getDomainConfig();

      expect(config.frontendUrl).toBe('http://localhost:3000');
      expect(config.fromEmail).toBe('noreply@inventoryhg.io');
    });

    it('should use SES_FROM_EMAIL env variable when set', () => {
      process.env.SES_FROM_EMAIL = 'test@example.com';

      const config = getDomainConfig();

      expect(config.frontendUrl).toBe('https://inventoryhg.io');
      expect(config.fromEmail).toBe('test@example.com');
    });

    it('should use both env variables when set', () => {
      process.env.FRONTEND_URL = 'http://localhost:3000';
      process.env.SES_FROM_EMAIL = 'test@example.com';

      const config = getDomainConfig();

      expect(config.frontendUrl).toBe('http://localhost:3000');
      expect(config.fromEmail).toBe('test@example.com');
      expect(config.applicationName).toBe('Inventory HQ');
      expect(config.primaryDomain).toBe('inventoryhg.io');
    });

    it('should always return the same application name regardless of env', () => {
      process.env.FRONTEND_URL = 'http://localhost:3000';

      const config = getDomainConfig();

      expect(config.applicationName).toBe('Inventory HQ');
    });

    it('should always return the same primary domain regardless of env', () => {
      process.env.FRONTEND_URL = 'http://localhost:3000';

      const config = getDomainConfig();

      expect(config.primaryDomain).toBe('inventoryhg.io');
    });
  });

  describe('Email Configuration Immutability', () => {
    it('should have EMAIL_CONFIG as a readonly object', () => {
      // TypeScript enforces this at compile time with 'as const'
      // At runtime, we can verify the object exists and has expected properties
      expect(EMAIL_CONFIG).toBeDefined();
      expect(EMAIL_CONFIG.fromAddress).toBe('noreply@inventoryhg.io');
      expect(EMAIL_CONFIG.fromName).toBe('Inventory HQ');
      expect(EMAIL_CONFIG.replyToAddress).toBe('support@inventoryhg.io');
    });
  });

  describe('Integration Tests', () => {
    it('should generate consistent URLs across helper functions', () => {
      const path = '/accept-invitation?token=xyz789';
      const fullUrl = getFrontendUrl(path);
      const isValid = isApplicationUrl(fullUrl);

      expect(fullUrl).toBe('https://inventoryhg.io/accept-invitation?token=xyz789');
      expect(isValid).toBe(true);
    });

    it('should generate email addresses with consistent domain', () => {
      const emailAddress = getEmailAddress('noreply');
      expect(emailAddress).toBe('noreply@inventoryhg.io');
      expect(emailAddress).toContain('@inventoryhg.io');
    });

    it('should validate URLs constructed from constants', () => {
      const url = `${FRONTEND_BASE_URL}/dashboard`;
      expect(isApplicationUrl(url)).toBe(true);
    });

    it('should validate www subdomain URLs', () => {
      const url = `https://${SUBDOMAINS.www}/dashboard`;
      expect(isApplicationUrl(url)).toBe(true);
    });
  });
});
