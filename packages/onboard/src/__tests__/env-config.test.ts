import { describe, expect, it } from 'vitest';
import { normalizeBasePath, validateBasePath } from '../env-config.js';

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
