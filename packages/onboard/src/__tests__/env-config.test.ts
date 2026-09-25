import { describe, expect, it } from 'vitest';
import { normalizeBasePath, validateBasePath, isVersionGreaterThan130, loadEnvExample } from '../env-config.js';

describe('env-config base path helpers', () => {
    it('accepts empty base path for root', () => {
        expect(validateBasePath('')).toBe(true);
    });

    it('accepts a single segment path', () => {
        expect(validateBasePath('/dashboard')).toBe(true);
    });

    it('accepts nested path segments', () => {
        expect(validateBasePath('/admin/v1')).toBe(true);
    });

    it('rejects path without leading slash', () => {
        expect(validateBasePath('dashboard')).not.toBe(true);
    });

    it('rejects trailing slash path', () => {
        expect(validateBasePath('/dashboard/')).not.toBe(true);
    });

    it('trims whitespace during normalization', () => {
        expect(normalizeBasePath('  /dashboard  ')).toBe('/dashboard');
    });
});

describe('isVersionGreaterThan130 version comparison', () => {
    it('treats latest, master, and empty as > 1.3.0', () => {
        expect(isVersionGreaterThan130('latest')).toBe(true);
        expect(isVersionGreaterThan130('master')).toBe(true);
        expect(isVersionGreaterThan130(undefined)).toBe(true);
        expect(isVersionGreaterThan130('')).toBe(true);
    });

    it('identifies versions <= 1.3.0 as legacy', () => {
        expect(isVersionGreaterThan130('1.3.0')).toBe(false);
        expect(isVersionGreaterThan130('v1.3.0')).toBe(false);
        expect(isVersionGreaterThan130('1.2.9')).toBe(false);
        expect(isVersionGreaterThan130('1.0.0')).toBe(false);
        expect(isVersionGreaterThan130('0.9.0')).toBe(false);
    });

    it('identifies versions > 1.3.0 as new', () => {
        expect(isVersionGreaterThan130('1.3.1')).toBe(true);
        expect(isVersionGreaterThan130('v1.3.1')).toBe(true);
        expect(isVersionGreaterThan130('1.4.0')).toBe(true);
        expect(isVersionGreaterThan130('2.0.0')).toBe(true);
    });
});

describe('loadEnvExample templates', () => {
    it('returns essential variables matching ./env.example for new versions (> 1.3.0)', async () => {
        const envVars = await loadEnvExample(false);
        const keys = envVars.map(v => v.key);

        expect(keys).not.toContain('NS_API_KEY');
        expect(keys).toContain('MONGO_URI');
        expect(keys).toContain('BROKERS');
        expect(keys).toContain('REDIS_URL');
        expect(keys).not.toContain('AUTH_SECRET');
        expect(keys).toContain('JWT_SECRET');
        expect(keys).toContain('VERSION');
        expect(keys).not.toContain('CORE_VERSION');
        expect(keys).not.toContain('DASHBOARD_VERSION');

        // Must NOT contain admin credentials or operational settings
        expect(keys).not.toContain('ADMIN_USERNAME');
        expect(keys).not.toContain('ADMIN_PASSWORD');
        expect(keys).not.toContain('OUTBOX_POLL_INTERVAL_MS');
        expect(keys).not.toContain('OUTBOX_BATCH_SIZE');
        expect(keys).not.toContain('RECOVERY_BATCH_SIZE');
        expect(keys).not.toContain('IDEMPOTENCY_TTL_SECONDS');
        expect(keys).not.toContain('HTTPS_COOKIE');
    });

    it('returns legacy variables including admin credentials and outbox settings for legacy (<= 1.3.0)', async () => {
        const envVars = await loadEnvExample(true);
        const keys = envVars.map(v => v.key);

        expect(keys).toContain('NS_API_KEY');
        expect(keys).toContain('VERSION');
        expect(keys).not.toContain('CORE_VERSION');
        expect(keys).not.toContain('DASHBOARD_VERSION');
        expect(keys).toContain('ADMIN_USERNAME');
        expect(keys).toContain('ADMIN_PASSWORD');
        expect(keys).toContain('OUTBOX_POLL_INTERVAL_MS');
        expect(keys).toContain('OUTBOX_BATCH_SIZE');
        expect(keys).toContain('RECOVERY_BATCH_SIZE');
        expect(keys).toContain('SIMPLENS_CONFIG_PATH');
    });
});
