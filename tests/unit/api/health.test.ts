import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import health_router from '@src/api/routes/health.routes.js';
import {
    getLiveness,
    getReadiness,
    setAppShuttingDown
} from '@src/api/controllers/health.controller.js';
import { getRedisClient } from '@src/config/redis.config.js';

vi.mock('@src/config/redis.config.js', () => ({
    getRedisClient: vi.fn(),
}));

describe('API Health Endpoints', () => {
    let app: express.Application;

    beforeEach(() => {
        vi.clearAllMocks();
        setAppShuttingDown(false);

        app = express();
        app.use('/api', health_router);
    });

    afterEach(() => {
        setAppShuttingDown(false);
    });

    describe('GET /api/health', () => {
        it('should return 200 and healthy when MongoDB and Redis are connected', async () => {
            // Mock mongoose connection readyState = 1 (connected)
            vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(1);

            // Mock Redis status = 'ready'
            vi.mocked(getRedisClient).mockReturnValue({
                status: 'ready',
            } as unknown as ReturnType<typeof getRedisClient>);

            const res = await request(app).get('/api/health');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                status: 'healthy',
                timestamp: expect.any(String),
                checks: {
                    mongodb: true,
                    redis: true,
                },
            });
        });

        it('should return 503 and unhealthy when MongoDB is disconnected', async () => {
            // Mock mongoose connection readyState = 0 (disconnected)
            vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(0);

            vi.mocked(getRedisClient).mockReturnValue({
                status: 'ready',
            } as unknown as ReturnType<typeof getRedisClient>);

            const res = await request(app).get('/api/health');

            expect(res.status).toBe(503);
            expect(res.body).toEqual({
                status: 'unhealthy',
                timestamp: expect.any(String),
                checks: {
                    mongodb: false,
                    redis: true,
                },
            });
        });

        it('should return 503 and unhealthy when Redis is disconnected', async () => {
            vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(1);

            vi.mocked(getRedisClient).mockReturnValue({
                status: 'close',
            } as unknown as ReturnType<typeof getRedisClient>);

            const res = await request(app).get('/api/health');

            expect(res.status).toBe(503);
            expect(res.body).toEqual({
                status: 'unhealthy',
                timestamp: expect.any(String),
                checks: {
                    mongodb: true,
                    redis: false,
                },
            });
        });

        it('should return 503 when the app is shutting down', async () => {
            vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(1);
            vi.mocked(getRedisClient).mockReturnValue({
                status: 'ready',
            } as unknown as ReturnType<typeof getRedisClient>);

            setAppShuttingDown(true);

            const res = await request(app).get('/api/health');

            expect(res.status).toBe(503);
            expect(res.body.status).toBe('unhealthy');
            expect(res.body.checks.mongodb).toBe(false);
            expect(res.body.checks.redis).toBe(false);
        });
    });

    describe('GET /api/healthz (liveness)', () => {
        it('should return 200 when process is not shutting down', async () => {
            const res = await request(app).get('/api/healthz');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                service: 'api',
                status: 'healthy',
                timestamp: expect.any(String),
                checks: {
                    process: true,
                },
            });
        });

        it('should return 503 when process is shutting down', async () => {
            setAppShuttingDown(true);

            const res = await request(app).get('/api/healthz');

            expect(res.status).toBe(503);
            expect(res.body).toEqual({
                service: 'api',
                status: 'unhealthy',
                timestamp: expect.any(String),
                checks: {
                    process: false,
                },
            });
        });
    });

    describe('GET /api/readyz (readiness)', () => {
        it('should return 200 and ready when all checks pass', async () => {
            vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(1);
            vi.mocked(getRedisClient).mockReturnValue({
                status: 'ready',
            } as unknown as ReturnType<typeof getRedisClient>);

            const res = await request(app).get('/api/readyz');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                service: 'api',
                status: 'ready',
                timestamp: expect.any(String),
                checks: {
                    mongodb: true,
                    redis: true,
                },
            });
        });

        it('should return 503 when readiness checks fail', async () => {
            vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(0);
            vi.mocked(getRedisClient).mockReturnValue({
                status: 'ready',
            } as unknown as ReturnType<typeof getRedisClient>);

            const res = await request(app).get('/api/readyz');

            expect(res.status).toBe(503);
            expect(res.body.status).toBe('not_ready');
            expect(res.body.checks.mongodb).toBe(false);
            expect(res.body.checks.redis).toBe(true);
        });
    });
});
