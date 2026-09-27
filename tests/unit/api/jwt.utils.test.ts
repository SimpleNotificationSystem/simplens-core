/**
 * Unit tests for jwt.utils.ts
 */

import { describe, it, expect } from 'vitest';
import { generateAdminJwt, verifyAdminJwt } from '@src/api/utils/jwt.utils.js';

describe('Admin JWT Utilities', () => {
    it('should generate a valid JWT token for admin user', () => {
        const admin = { id: 'admin-1', username: 'admin' };
        const token = generateAdminJwt(admin);

        expect(token).toBeDefined();
        expect(typeof token).toBe('string');
        expect(token.split('.')).toHaveLength(3);
    });

    it('should verify and decode a valid JWT token', () => {
        const admin = { id: 'admin-42', username: 'superadmin' };
        const token = generateAdminJwt(admin);

        const decoded = verifyAdminJwt(token);
        expect(decoded).not.toBeNull();
        expect(decoded?.sub).toBe('admin-42');
        expect(decoded?.username).toBe('superadmin');
        expect(decoded?.role).toBe('admin');
    });

    it('should return null when token signature is tampered', () => {
        const admin = { id: 'admin-1', username: 'admin' };
        const token = generateAdminJwt(admin);
        const tamperedToken = token.slice(0, -5) + 'abcde';

        const decoded = verifyAdminJwt(tamperedToken);
        expect(decoded).toBeNull();
    });

    it('should return null for malformed tokens', () => {
        expect(verifyAdminJwt('not.a.valid.jwt')).toBeNull();
        expect(verifyAdminJwt('')).toBeNull();
        expect(verifyAdminJwt('random-string')).toBeNull();
    });

    describe('JWT Secret Validation', () => {
        it('should fail if JWT_SECRET is empty or whitespace', async () => {
            const { validateJwtSecret } = await import('@src/config/env.config.js');
            expect(() => validateJwtSecret('')).toThrow(/missing/i);
            expect(() => validateJwtSecret('   ')).toThrow(/missing/i);
        });

        it('should fail if JWT_SECRET is the default insecure placeholder', async () => {
            const { validateJwtSecret, INSECURE_JWT_SECRET_FALLBACK } = await import('@src/config/env.config.js');
            expect(() => validateJwtSecret(INSECURE_JWT_SECRET_FALLBACK)).toThrow(/insecure placeholder/i);
        });

        it('should fail if JWT_SECRET is shorter than 32 characters', async () => {
            const { validateJwtSecret } = await import('@src/config/env.config.js');
            expect(() => validateJwtSecret('short-secret-key-123')).toThrow(/too short/i);
        });

        it('should succeed when JWT_SECRET is at least 32 characters', async () => {
            const { validateJwtSecret } = await import('@src/config/env.config.js');
            const valid = 'a-very-strong-and-secure-random-jwt-secret-key-32-chars';
            expect(validateJwtSecret(valid)).toBe(valid);
        });
    });
});
