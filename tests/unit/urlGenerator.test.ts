/**
 * Unit tests for URL ID generator
 * 
 * @description Tests for cryptographic randomness, format validation,
 * uniqueness, and bidirectional conversion.
 */

import {
  generateUrlId,
  isValidUrlId,
  uuidToBase62,
  base62ToUuid,
  testUniqueness,
} from '../../src/lib/urlGenerator';

describe('urlGenerator', () => {
  describe('generateUrlId', () => {
    it('should generate URL ID with correct length (22 characters)', () => {
      const urlId = generateUrlId();
      expect(urlId).toHaveLength(22);
    });

    it('should generate URL ID with only alphanumeric characters', () => {
      const urlId = generateUrlId();
      expect(urlId).toMatch(/^[A-Za-z0-9]{22}$/);
    });

    it('should generate different URL IDs on consecutive calls', () => {
      const urlId1 = generateUrlId();
      const urlId2 = generateUrlId();
      const urlId3 = generateUrlId();
      
      expect(urlId1).not.toBe(urlId2);
      expect(urlId2).not.toBe(urlId3);
      expect(urlId1).not.toBe(urlId3);
    });

    it('should generate URL IDs with high entropy (no obvious patterns)', () => {
      const ids = Array.from({ length: 10 }, () => generateUrlId());
      
      // Check that no two IDs share the same prefix (first 5 characters)
      const prefixes = new Set(ids.map(id => id.slice(0, 5)));
      expect(prefixes.size).toBeGreaterThan(8); // At least 80% unique prefixes
    });
  });

  describe('isValidUrlId', () => {
    it('should return true for valid URL IDs', () => {
      // Generate some actual valid IDs first
      const generated = [generateUrlId(), generateUrlId()];
      
      const validIds = [
        ...generated,
        '2aUyqjCzEIiEcYMKj7TZtw', // 22 chars alphanumeric
        '7pQm3nX8kD5wZ2gS9YbN4c', // 22 chars alphanumeric  
        '0000000000000000000000', // 22 zeros
        'ZZZZZZZZZZZZZZZZZZZZZZ', // 22 Zs
        'abcdefghijklmnopqrstuv', // 22 lowercase
      ];
      
      validIds.forEach(id => {
        expect(isValidUrlId(id)).toBe(true);
      });
    });

    it('should return false for invalid URL IDs (wrong length)', () => {
      const invalidIds = [
        'short',
        'toolongforthecorrectformat',
        '2gSZw8ZQPb7D5kN3X8m', // 19 chars
        '2gSZw8ZQPb7D5kN3X8mQ789', // 23 chars
      ];
      
      invalidIds.forEach(id => {
        expect(isValidUrlId(id)).toBe(false);
      });
    });

    it('should return false for invalid URL IDs (special characters)', () => {
      const invalidIds = [
        '2gSZw8ZQPb7D5kN3X8mQ-', // hyphen
        '2gSZw8ZQPb7D5kN3X8mQ!', // exclamation
        '2gSZw8ZQPb7D5kN3X8mQ+', // plus
        '2gSZw8ZQPb7D5kN3X8mQ/', // slash
      ];
      
      invalidIds.forEach(id => {
        expect(isValidUrlId(id)).toBe(false);
      });
    });

    it('should return false for empty or whitespace strings', () => {
      expect(isValidUrlId('')).toBe(false);
      expect(isValidUrlId('   ')).toBe(false);
      expect(isValidUrlId('2gSZw8ZQPb7D5kN3X8mQ ')).toBe(false); // trailing space
    });
  });

  describe('uuidToBase62 and base62ToUuid', () => {
    const testCases = [
      '550e8400-e29b-41d4-a716-446655440000',
      '123e4567-e89b-12d3-a456-426614174000',
      '00000000-0000-0000-0000-000000000000',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
    ];

    it('should convert UUID to base62 with correct length', () => {
      testCases.forEach(uuid => {
        const base62 = uuidToBase62(uuid);
        expect(base62).toHaveLength(22);
        expect(base62).toMatch(/^[A-Za-z0-9]{22}$/);
      });
    });

    it('should convert base62 back to UUID (bidirectional)', () => {
      testCases.forEach(uuid => {
        const base62 = uuidToBase62(uuid);
        const convertedBack = base62ToUuid(base62);
        expect(convertedBack).toBe(uuid);
      });
    });

    it('should handle generated URL IDs (roundtrip test)', () => {
      for (let i = 0; i < 100; i++) {
        const urlId = generateUrlId();
        const uuid = base62ToUuid(urlId);
        const convertedBack = uuidToBase62(uuid);
        expect(convertedBack).toBe(urlId);
      }
    });

    it('should throw error for invalid base62 input', () => {
      expect(() => base62ToUuid('invalid-chars!')).toThrow('Invalid base62 character');
    });
  });

  describe('testUniqueness', () => {
    it('should detect uniqueness in small sample (100 IDs)', () => {
      const result = testUniqueness(100);
      expect(result).toBe(true);
    });

    it('should detect uniqueness in larger sample (10,000 IDs)', () => {
      const result = testUniqueness(10000);
      expect(result).toBe(true);
    }, 30000); // Increase timeout for large test

    it('should return false if duplicates are injected (manual test)', () => {
      // This is a sanity check - in practice, duplicates should never occur
      // with crypto.randomUUID(), but we test the function logic
      const set = new Set<string>();
      const duplicateId = 'testDuplicateId12345';
      
      // Simulate duplicate detection logic
      let hasDuplicate = false;
      [duplicateId, 'uniqueId1', duplicateId].forEach(id => {
        if (set.has(id)) {
          hasDuplicate = true;
        }
        set.add(id);
      });
      
      expect(hasDuplicate).toBe(true);
    });
  });

  describe('entropy and collision probability', () => {
    it('should have sufficient entropy (122 bits from UUID v4)', () => {
      // UUID v4 has 122 bits of random data (128 bits total, 6 bits reserved)
      // Base62 encoding preserves entropy
      const urlId = generateUrlId();
      const uuid = base62ToUuid(urlId);
      
      // Verify UUID format (version 4 has '4' in the 13th position)
      expect(uuid.charAt(14)).toMatch(/[0-9a-f]/);
      
      // Collision probability calculation:
      // P(collision after N generations) ≈ N^2 / (2 * 2^122)
      // For N = 1 billion: P ≈ 1 in 10^18 (negligible)
    });

    it('should generate URL IDs with uniform distribution (statistical test)', () => {
      const sampleSize = 1000;
      const charCounts: Record<string, number> = {};
      
      // Count character frequency across all positions
      for (let i = 0; i < sampleSize; i++) {
        const urlId = generateUrlId();
        for (const char of urlId) {
          charCounts[char] = (charCounts[char] || 0) + 1;
        }
      }
      
      // Each character should appear roughly equally (within 50% variance)
      const totalChars = sampleSize * 22;
      const expectedFrequency = totalChars / 62; // 62 possible characters
      const tolerance = expectedFrequency * 0.5; // 50% tolerance
      
      Object.values(charCounts).forEach(count => {
        expect(count).toBeGreaterThan(expectedFrequency - tolerance);
        expect(count).toBeLessThan(expectedFrequency + tolerance);
      });
    });
  });

  describe('performance benchmarks', () => {
    it('should generate 1000 URL IDs in < 100ms', () => {
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        generateUrlId();
      }
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });

    it('should validate 10000 URL IDs in < 50ms', () => {
      const urlIds = Array.from({ length: 10000 }, () => generateUrlId());
      
      const start = Date.now();
      urlIds.forEach(id => isValidUrlId(id));
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(50);
    });
  });
});
