/**
 * Unit Tests for SimpleNSProvider Validation and Rollback
 */

import { describe, it, expect, vi } from 'vitest';
import { validateSimpleNSProvider } from '../../../src/plugins/loader/plugin-fs.js';

describe('validateSimpleNSProvider', () => {
  const validProvider = {
    manifest: {
      name: '@simplens/mock',
      displayName: 'Mock Provider',
      version: '1.0.0',
      channel: 'mock',
      description: 'A mock provider for testing',
      requiredCredentials: [],
    },
    send: vi.fn(),
    initialize: vi.fn(),
    healthCheck: vi.fn(),
    shutdown: vi.fn(),
    getNotificationSchema: vi.fn(),
    getRecipientSchema: vi.fn(),
    getContentSchema: vi.fn(),
    getRateLimitConfig: vi.fn(),
  };

  it('should accept a valid SimpleNSProvider implementation', () => {
    const validated = validateSimpleNSProvider(validProvider, '@simplens/mock');
    expect(validated).toBeDefined();
    expect(validated.manifest.name).toBe('@simplens/mock');
  });

  it('should reject a non-object or null export', () => {
    expect(() => validateSimpleNSProvider(null, 'bad-pkg')).toThrow(
      "Package 'bad-pkg' is not a valid SimpleNS plugin: default export must be a Provider object or class."
    );
    expect(() => validateSimpleNSProvider(123, 'bad-pkg')).toThrow(
      "Package 'bad-pkg' is not a valid SimpleNS plugin: default export must be a Provider object or class."
    );
  });

  it('should reject when manifest is missing', () => {
    const missingManifest = { ...validProvider, manifest: undefined };
    expect(() => validateSimpleNSProvider(missingManifest, 'missing-manifest')).toThrow(
      "Package 'missing-manifest' is not a valid SimpleNS plugin: missing 'manifest' definition."
    );
  });

  it('should reject when manifest fails schema validation (e.g. missing channel)', () => {
    const invalidManifest = {
      ...validProvider,
      manifest: {
        name: 'test',
        // channel missing
        displayName: 'Test',
        description: 'desc',
        version: '1.0.0',
        requiredCredentials: [],
      },
    };
    expect(() => validateSimpleNSProvider(invalidManifest, 'invalid-manifest')).toThrow(
      "has an invalid plugin manifest"
    );
  });

  it('should reject arbitrary packages missing required provider methods (e.g. lodash / express)', () => {
    const arbitraryPackage = {
      default: () => ({ someUtility: true }),
      manifest: {
        name: 'arbitrary',
        displayName: 'Arbitrary',
        version: '1.0.0',
        channel: 'email',
        description: 'Not a real provider',
        requiredCredentials: [],
      },
      // missing send, initialize, healthCheck, etc.
    };

    expect(() => validateSimpleNSProvider(arbitraryPackage, 'lodash')).toThrow(
      "Package 'lodash' is not a valid SimpleNS plugin. Missing required provider methods: send, initialize, healthCheck, shutdown, getNotificationSchema, getRecipientSchema, getContentSchema, getRateLimitConfig"
    );
  });
});
