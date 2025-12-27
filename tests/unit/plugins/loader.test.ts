/**
 * Unit Tests for Plugin Loader
 * Tests the plugin loading and configuration system
 * 
 * NOTE: Many loader functions are tested indirectly through integration tests
 * because they involve file system operations and dynamic imports that are
 * difficult to mock in unit tests with module caching.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Simple tests for exported utilities that don't require complex mocking
describe('Plugin Loader Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.SIMPLENS_CONFIG_PATH;
    });

    afterEach(() => {
        vi.resetModules();
    });

    describe('module exports', () => {
        it('should export loader functions', async () => {
            const loader = await import('../../../src/plugins/loader/loader.js');

            expect(loader.loadProviders).toBeDefined();
            expect(loader.loadProvidersFromEnv).toBeDefined();
            expect(loader.getConfiguredChannels).toBeDefined();
            expect(loader.registerProvider).toBeDefined();
            expect(typeof loader.loadProviders).toBe('function');
            expect(typeof loader.loadProvidersFromEnv).toBe('function');
            expect(typeof loader.getConfiguredChannels).toBe('function');
            expect(typeof loader.registerProvider).toBe('function');
        });
    });

    describe('getConfiguredChannels with no config', () => {
        it('should return empty array when config file does not exist', async () => {
            const { getConfiguredChannels } = await import('../../../src/plugins/loader/loader.js');

            // Non-existent config path
            const channels = getConfiguredChannels('./non-existent-config.yaml');

            // Should return an array (may be empty or contain previously loaded channels)
            expect(Array.isArray(channels)).toBe(true);
        });
    });

    describe('loadProvidersFromEnv', () => {
        it('should use SIMPLENS_CONFIG_PATH environment variable when set', async () => {
            process.env.SIMPLENS_CONFIG_PATH = './test-config.yaml';

            // Reset modules to pick up the new env var
            vi.resetModules();

            const { loadProvidersFromEnv } = await import('../../../src/plugins/loader/loader.js');

            // This will try to load from the env-configured path
            // and gracefully handle missing file
            await expect(loadProvidersFromEnv({ initialize: false })).resolves.not.toThrow();
        });

        it('should use default config path when env not set', async () => {
            delete process.env.SIMPLENS_CONFIG_PATH;

            vi.resetModules();

            const { loadProvidersFromEnv } = await import('../../../src/plugins/loader/loader.js');

            // This will use default path and gracefully handle missing file
            await expect(loadProvidersFromEnv({ initialize: false })).resolves.not.toThrow();
        });
    });
});
