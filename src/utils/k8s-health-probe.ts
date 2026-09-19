/**
 * Lightweight Kubernetes Health Probe Server
 * 
 * Provides HTTP endpoints (/healthz, /readyz) for background workers
 * and processors to integrate cleanly with Kubernetes liveness and readiness probes.
 * 
 * Uses Node's built-in http module for zero runtime overhead.
 */

import http from 'http';
import type { HealthProbeOptions, HealthProbeServer } from '@src/types/types.js';

export const createHealthProbeServer = (options: HealthProbeOptions): HealthProbeServer => {
    const port = options.port ?? parseInt(process.env.PROBE_PORT || '8080', 10);
    const serviceName = options.serviceName;
    const readinessChecks = options.readinessChecks ?? [];
    const livenessChecks = options.livenessChecks ?? [];

    let server: http.Server | null = null;

    const runChecks = async (checks: typeof readinessChecks): Promise<{ ok: boolean; results: Record<string, boolean> }> => {
        const results: Record<string, boolean> = {};
        let allOk = true;

        for (const item of checks) {
            try {
                const passed = await item.check();
                results[item.name] = passed;
                if (!passed) allOk = false;
            } catch {
                results[item.name] = false;
                allOk = false;
            }
        }

        return { ok: allOk, results };
    };

    const requestListener: http.RequestListener = async (req, res) => {
        const url = req.url || '';

        // Liveness probe
        if (url === '/healthz' || url === '/livez') {
            const { ok, results } = await runChecks(livenessChecks);
            const status = ok ? 200 : 503;
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                service: serviceName,
                status: ok ? 'healthy' : 'unhealthy',
                timestamp: new Date().toISOString(),
                checks: results
            }));
            return;
        }

        // Readiness probe
        if (url === '/readyz' || url === '/ready') {
            const { ok, results } = await runChecks(readinessChecks);
            const status = ok ? 200 : 503;
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                service: serviceName,
                status: ok ? 'ready' : 'not_ready',
                timestamp: new Date().toISOString(),
                checks: results
            }));
            return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
    };

    return {
        start: async (): Promise<void> => {
            // Allow disabling health probe explicitly via environment variable
            if (process.env.ENABLE_HEALTH_PROBE === 'false') {
                return;
            }

            return new Promise((resolve, reject) => {
                server = http.createServer(requestListener);

                server.on('error', (err: NodeJS.ErrnoException) => {
                    // If port is already in use (e.g. running multiple services locally in one container),
                    // log and do not crash the service
                    if (err.code === 'EADDRINUSE') {
                        console.warn(`[HealthProbe:${serviceName}] Port ${port} is already in use, health probe disabled.`);
                        resolve();
                        return;
                    }
                    reject(err);
                });

                server.listen(port, () => {
                    console.info(`[HealthProbe:${serviceName}] Listening on port ${port} (/healthz, /readyz)`);
                    resolve();
                });
            });
        },

        stop: async (): Promise<void> => {
            if (!server) return;

            return new Promise((resolve) => {
                server!.close(() => {
                    server = null;
                    resolve();
                });
            });
        }
    };
};
