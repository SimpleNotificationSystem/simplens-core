import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { runHealthChecks, createHealthProbeServer } from '@src/utils/k8s-health-probe.js';
import type { HealthProbeCheck, HealthProbeServer } from '@src/types/types.js';

describe('k8s-health-probe utility', () => {
    describe('runHealthChecks', () => {
        it('should return ok: true when all checks pass', async () => {
            const checks: HealthProbeCheck[] = [
                { name: 'db', check: () => true },
                { name: 'cache', check: async () => true },
            ];

            const result = await runHealthChecks(checks);
            expect(result.ok).toBe(true);
            expect(result.results).toEqual({
                db: true,
                cache: true,
            });
        });

        it('should return ok: false when one check fails', async () => {
            const checks: HealthProbeCheck[] = [
                { name: 'db', check: () => true },
                { name: 'cache', check: () => false },
            ];

            const result = await runHealthChecks(checks);
            expect(result.ok).toBe(false);
            expect(result.results).toEqual({
                db: true,
                cache: false,
            });
        });

        it('should handle thrown errors gracefully and mark check false', async () => {
            const checks: HealthProbeCheck[] = [
                { name: 'db', check: () => true },
                {
                    name: 'cache',
                    check: () => {
                        throw new Error('Connection refused');
                    },
                },
            ];

            const result = await runHealthChecks(checks);
            expect(result.ok).toBe(false);
            expect(result.results).toEqual({
                db: true,
                cache: false,
            });
        });

        it('should handle empty checks gracefully', async () => {
            const result = await runHealthChecks([]);
            expect(result.ok).toBe(true);
            expect(result.results).toEqual({});
        });
    });

    describe('createHealthProbeServer', () => {
        let probeServer: HealthProbeServer | null = null;
        const testPort = 18991;

        afterEach(async () => {
            if (probeServer) {
                await probeServer.stop();
                probeServer = null;
            }
        });

        it('should respond to /healthz and /readyz correctly when healthy', async () => {
            const port = 18991;
            probeServer = createHealthProbeServer({
                port,
                serviceName: 'test-service',
                livenessChecks: [{ name: 'process', check: () => true }],
                readinessChecks: [{ name: 'db', check: () => true }],
            });
            await probeServer.start();

            const healthzRes = await axios.get(`http://127.0.0.1:${port}/healthz`);
            expect(healthzRes.status).toBe(200);
            expect(healthzRes.data).toEqual(
                expect.objectContaining({
                    service: 'test-service',
                    status: 'healthy',
                    checks: { process: true },
                })
            );

            const readyzRes = await axios.get(`http://127.0.0.1:${port}/readyz`);
            expect(readyzRes.status).toBe(200);
            expect(readyzRes.data).toEqual(
                expect.objectContaining({
                    service: 'test-service',
                    status: 'ready',
                    checks: { db: true },
                })
            );
        });

        it('should return 503 on /readyz when a readiness check fails', async () => {
            const port = 18992;
            probeServer = createHealthProbeServer({
                port,
                serviceName: 'test-service',
                readinessChecks: [
                    { name: 'db', check: () => true },
                    { name: 'redis', check: () => false },
                ],
            });
            await probeServer.start();

            try {
                await axios.get(`http://127.0.0.1:${port}/readyz`);
                expect.unreachable('Should have thrown HTTP 503');
            } catch (err: unknown) {
                if (axios.isAxiosError(err)) {
                    expect(err.response?.status).toBe(503);
                    expect(err.response?.data).toEqual(
                        expect.objectContaining({
                            service: 'test-service',
                            status: 'not_ready',
                            checks: { db: true, redis: false },
                        })
                    );
                } else {
                    throw err;
                }
            }
        });

        it('should return 404 for unknown endpoints', async () => {
            const port = 18993;
            probeServer = createHealthProbeServer({
                port,
                serviceName: 'test-service',
            });
            await probeServer.start();

            try {
                await axios.get(`http://127.0.0.1:${port}/unknown`);
                expect.unreachable('Should have thrown HTTP 404');
            } catch (err: unknown) {
                if (axios.isAxiosError(err)) {
                    expect(err.response?.status).toBe(404);
                } else {
                    throw err;
                }
            }
        });
    });
});
