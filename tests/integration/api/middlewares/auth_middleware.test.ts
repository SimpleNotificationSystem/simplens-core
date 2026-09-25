/**
 * Integration tests for auth_middleware.ts
 * Tests API authentication middleware with Admin JWT and Dynamic API Keys
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { generateAdminJwt } from '../../../../src/api/utils/jwt.utils.js';

// Mock DB model for api_key_model
const mockFindOne = vi.fn();
const mockUpdateOne = vi.fn().mockReturnValue({
    catch: vi.fn(),
});

vi.mock('@src/database/models/api-key.models.js', () => ({
    default: {
        findOne: (...args: unknown[]) => mockFindOne(...args),
        updateOne: (...args: unknown[]) => mockUpdateOne(...args),
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

    const createMockRequest = (
        authHeader?: string,
        path: string = '/api/notifications',
        cookieHeader?: string,
    ): Partial<Request> => ({
        headers: {
            ...(authHeader ? { authorization: authHeader } : {}),
            ...(cookieHeader ? { cookie: cookieHeader } : {}),
        },
        originalUrl: path,
        path,
    });

    const createMockResponse = (): Partial<Response> => {
        const res: Partial<Response> = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };
        return res;
    };

    beforeEach(async () => {
        vi.clearAllMocks();
        authMiddleware = await import('../../../../src/api/middlewares/auth_middleware.js');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Admin JWT Authentication', () => {
        it('should call next() and populate req.user for valid Admin JWT', () => {
            const token = generateAdminJwt({ id: 'admin-1', username: 'admin' });
            const req = createMockRequest(`Bearer ${token}`) as Request;
            const res = createMockResponse() as Response;
            const next = vi.fn();

            authMiddleware.auth_middleware(req, res, next as NextFunction);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
            expect(req.user?.username).toBe('admin');
        });
    });

    describe('Dynamic API Key Authentication', () => {
        it('should call next() and populate req.apiKey for valid dynamic key', async () => {
            const rawKey = 'sns_live_abcdef1234567890';
            const hashed = crypto.createHash('sha256').update(rawKey).digest('hex');

            const mockKeyDoc = {
                key_id: 'key-123',
                name: 'Test Service',
                key_hash: hashed,
                status: 'active',
                expires_at: null,
                toObject: () => ({
                    key_id: 'key-123',
                    name: 'Test Service',
                    status: 'active',
                }),
            };

            mockFindOne.mockResolvedValueOnce(mockKeyDoc);

            const req = createMockRequest(`Bearer ${rawKey}`) as Request;
            const res = createMockResponse() as Response;
            const next = vi.fn();

            await authMiddleware.auth_middleware(req, res, next as NextFunction);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
            expect(req.apiKey?.name).toBe('Test Service');
        });

        it('should return 401 when dynamic API key is not found or revoked', async () => {
            mockFindOne.mockResolvedValueOnce(null);

            const req = createMockRequest('Bearer sns_live_unknownkey') as Request;
            const res = createMockResponse() as Response;
            const next = vi.fn();

            await authMiddleware.auth_middleware(req, res, next as NextFunction);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ message: 'Invalid API KEY' });
            expect(next).not.toHaveBeenCalled();
        });

        it('should return 401 when dynamic API key has expired', async () => {
            const rawKey = 'sns_live_expiredkey';
            const mockKeyDoc = {
                key_id: 'key-expired',
                status: 'active',
                expires_at: new Date(Date.now() - 10000), // past
                toObject: () => ({ key_id: 'key-expired' }),
            };

            mockFindOne.mockResolvedValueOnce(mockKeyDoc);

            const req = createMockRequest(`Bearer ${rawKey}`) as Request;
            const res = createMockResponse() as Response;
            const next = vi.fn();

            await authMiddleware.auth_middleware(req, res, next as NextFunction);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ message: 'API key has expired' });
            expect(next).not.toHaveBeenCalled();
        });

        it('should return 403 when dynamic API key accesses admin credential routes', async () => {
            const rawKey = 'sns_live_testkey';
            const mockKeyDoc = {
                key_id: 'key-123',
                status: 'active',
                expires_at: null,
                toObject: () => ({ key_id: 'key-123' }),
            };

            mockFindOne.mockResolvedValueOnce(mockKeyDoc);

            const req = createMockRequest(`Bearer ${rawKey}`, '/api/admin/auth/setup') as Request;
            const res = createMockResponse() as Response;
            const next = vi.fn();

            await authMiddleware.auth_middleware(req, res, next as NextFunction);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('Missing or Invalid Authentication', () => {
        it('should return 401 when authorization header is missing', () => {
            const req = createMockRequest() as Request;
            const res = createMockResponse() as Response;
            const next = vi.fn();

            authMiddleware.auth_middleware(req, res, next as NextFunction);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('API KEY missing'),
                })
            );
            expect(next).not.toHaveBeenCalled();
        });

        it('should return 401 when Bearer prefix is missing', () => {
            const req = createMockRequest('raw-string-without-bearer') as Request;
            const res = createMockResponse() as Response;
            const next = vi.fn();

            authMiddleware.auth_middleware(req, res, next as NextFunction);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining("'Bearer' is missing"),
                })
            );
            expect(next).not.toHaveBeenCalled();
        });

        it('should return 401 for unknown non-JWT non-dynamic token', () => {
            const req = createMockRequest('Bearer random-legacy-token') as Request;
            const res = createMockResponse() as Response;
            const next = vi.fn();

            authMiddleware.auth_middleware(req, res, next as NextFunction);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ message: 'Invalid API KEY' });
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('Cookie Authentication', () => {
        it('should authenticate via simplens_session cookie containing valid Admin JWT', () => {
            const token = generateAdminJwt({ id: 'admin-1', username: 'admin' });
            const req = createMockRequest(undefined, '/api/notifications', `simplens_session=${token}`) as Request;
            const res = createMockResponse() as Response;
            const next = vi.fn();

            authMiddleware.auth_middleware(req, res, next as NextFunction);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
            expect(req.user?.username).toBe('admin');
        });

        it('should authenticate via simplens_session cookie among other cookies', () => {
            const token = generateAdminJwt({ id: 'admin-1', username: 'admin' });
            const req = createMockRequest(
                undefined,
                '/api/notifications',
                `theme=dark; simplens_session=${token}; lang=en`
            ) as Request;
            const res = createMockResponse() as Response;
            const next = vi.fn();

            authMiddleware.auth_middleware(req, res, next as NextFunction);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
            expect(req.user?.username).toBe('admin');
        });

        it('should return 401 when simplens_session cookie contains an invalid token', () => {
            const req = createMockRequest(
                undefined,
                '/api/notifications',
                'simplens_session=invalid-cookie-token'
            ) as Request;
            const res = createMockResponse() as Response;
            const next = vi.fn();

            authMiddleware.auth_middleware(req, res, next as NextFunction);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ message: 'Invalid API KEY' });
            expect(next).not.toHaveBeenCalled();
        });
    });
});
