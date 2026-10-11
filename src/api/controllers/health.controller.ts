import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { getRedisClient } from '@src/config/redis.config.js';
import { runHealthChecks } from '@src/utils/k8s-health-probe.js';
import type { HealthProbeCheck, ApiHealthResponse } from '@src/types/types.js';

let isAppShuttingDown = false;

export const setAppShuttingDown = (value: boolean): void => {
    isAppShuttingDown = value;
};

export const getApiReadinessChecks = (): HealthProbeCheck[] => [
    {
        name: 'mongodb',
        check: () => !isAppShuttingDown && mongoose.connection.readyState === 1
    },
    {
        name: 'redis',
        check: () => {
            if (isAppShuttingDown) return false;
            try {
                return getRedisClient().status === 'ready';
            } catch {
                return false;
            }
        }
    }
];

export const getApiLivenessChecks = (): HealthProbeCheck[] => [
    {
        name: 'process',
        check: () => !isAppShuttingDown
    }
];

export const getHealth = async (req: Request, res: Response): Promise<void> => {
    const { ok, results } = await runHealthChecks(getApiReadinessChecks());
    const payload: ApiHealthResponse = {
        status: ok ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        checks: results
    };
    res.status(ok ? 200 : 503).json(payload);
};

export const getLiveness = async (req: Request, res: Response): Promise<void> => {
    const { ok, results } = await runHealthChecks(getApiLivenessChecks());
    const payload: ApiHealthResponse = {
        service: 'api',
        status: ok ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        checks: results
    };
    res.status(ok ? 200 : 503).json(payload);
};

export const getReadiness = async (req: Request, res: Response): Promise<void> => {
    const { ok, results } = await runHealthChecks(getApiReadinessChecks());
    const payload: ApiHealthResponse = {
        service: 'api',
        status: ok ? 'ready' : 'not_ready',
        timestamp: new Date().toISOString(),
        checks: results
    };
    res.status(ok ? 200 : 503).json(payload);
};
