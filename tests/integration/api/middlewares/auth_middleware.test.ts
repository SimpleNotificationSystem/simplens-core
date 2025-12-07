/**
 * Integration tests for auth_middleware.ts
 * Tests API authentication middleware with mocked environment
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mocked env that can be modified per test
let mockApiKey: string | undefined = 'valid-api-key-12345';

// Mock env config - using a factory function to return fresh mock
vi.mock('@src/config/env.config.js', () => ({
    env: {
        get NS_API_KEY() {
            return mockApiKey;
        },
    },
}));

// Mock logger
vi.mock('@src/workers/utils/logger.js', () => ({
    apiLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
    },
}));

describe('Auth Middleware', () => {
    let authMiddleware: typeof import('../../../../src/api/middlewares/auth_middleware.js');

    // Helper to create mock request
    const createMockRequest = (authHeader?: string): Partial<Request> => ({
        headers: authHeader ? { authorization: authHeader } : {},
    });

    // Helper to create mock response
    const createMockResponse = (): Partial<Response> => {
        const res: Partial<Response> = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };
        return res;
    };

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();

        // Reset to valid API key by default
        mockApiKey = 'valid-api-key-12345';

        authMiddleware = await import('../../../../src/api/middlewares/auth_middleware.js');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Valid authentication', () => {
        it('should call next() for valid API key', () => {
            const req = createMockRequest('Bearer valid-api-key-12345');
            const res = createMockResponse();
            const next = vi.fn();

            authMiddleware.auth_middleware(
                req as Request,
                res as Response,
                next as NextFunction
            );

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });
    });

    describe('Missing authentication', () => {
        it('should return 401 when authorization header is missing', () => {
            const req = createMockRequest();
            const res = createMockResponse();
            const next = vi.fn();

            authMiddleware.auth_middleware(
                req as Request,
                res as Response,
                next as NextFunction
            );

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('API KEY missing'),
                })
            );
            expect(next).not.toHaveBeenCalled();
        });

        it('should return 401 when Bearer prefix is missing', () => {
            const req = createMockRequest('valid-api-key-12345');
            const res = createMockResponse();
            const next = vi.fn();

            authMiddleware.auth_middleware(
                req as Request,
                res as Response,
                next as NextFunction
            );

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining("'Bearer' is missing"),
                })
            );
        });
    });

    describe('Invalid authentication', () => {
        it('should return 401 for invalid API key', () => {
            const req = createMockRequest('Bearer wrong-api-key');
            const res = createMockResponse();
            const next = vi.fn();

            authMiddleware.auth_middleware(
                req as Request,
                res as Response,
                next as NextFunction
            );

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Invalid API KEY',
                })
            );
        });

        it('should return 401 for API key with different length', () => {
            const req = createMockRequest('Bearer short');
            const res = createMockResponse();
            const next = vi.fn();

            authMiddleware.auth_middleware(
                req as Request,
                res as Response,
                next as NextFunction
            );

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Invalid API KEY',
                })
            );
        });

        it('should return 401 for empty API key after Bearer', () => {
            const req = createMockRequest('Bearer ');
            const res = createMockResponse();
            const next = vi.fn();

            authMiddleware.auth_middleware(
                req as Request,
                res as Response,
                next as NextFunction
            );

            expect(res.status).toHaveBeenCalledWith(401);
        });
    });

    describe('Server configuration errors', () => {
        it('should return 500 when NS_API_KEY is not configured', async () => {
            mockApiKey = undefined;
            vi.resetModules();
            const freshMiddleware = await import('../../../../src/api/middlewares/auth_middleware.js');

            const req = createMockRequest('Bearer some-key');
            const res = createMockResponse();
            const next = vi.fn();

            freshMiddleware.auth_middleware(
                req as Request,
                res as Response,
                next as NextFunction
            );

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Server configuration error',
                })
            );
        });

        it('should return 500 when NS_API_KEY is empty string', async () => {
            mockApiKey = '';
            vi.resetModules();
            const freshMiddleware = await import('../../../../src/api/middlewares/auth_middleware.js');

            const req = createMockRequest('Bearer some-key');
            const res = createMockResponse();
            const next = vi.fn();

            freshMiddleware.auth_middleware(
                req as Request,
                res as Response,
                next as NextFunction
            );

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });
});
