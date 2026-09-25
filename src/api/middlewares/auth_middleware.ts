/**
 * Core Authentication Middleware
 * 
 * Authenticates API requests using:
 * 1. Admin JWT tokens (issued for the Next.js Dashboard).
 * 2. Dynamic API Keys (prefixed with 'sns_' and stored in MongoDB).
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import api_key_model from '@src/database/models/api-key.models.js';
import { verifyAdminJwt } from '../utils/jwt.utils.js';
import { apiLogger as logger } from '@src/workers/utils/logger.js';
import type { ApiKeyDoc, AdminJwtPayload } from '@src/types/types.js';

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            user?: AdminJwtPayload;
            apiKey?: ApiKeyDoc;
        }
    }
}

async function handleDynamicApiKey(
    token: string,
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const keyDoc = await api_key_model.findOne({ key_hash: tokenHash, status: 'active' });

        if (!keyDoc) {
            res.status(401).json({ message: 'Invalid API KEY' });
            return;
        }

        if (keyDoc.expires_at && new Date() > new Date(keyDoc.expires_at)) {
            res.status(401).json({ message: 'API key has expired' });
            return;
        }

        const path = req.originalUrl || req.path;
        if (path.includes('/api/admin/auth/setup') || path.includes('/api/admin/auth/verify')) {
            res.status(403).json({
                error: 'Forbidden: API keys cannot access administrator credential setup or verification routes.',
            });
            return;
        }

        req.apiKey = keyDoc.toObject() as ApiKeyDoc;

        void api_key_model.updateOne(
            { key_id: keyDoc.key_id },
            {
                $set: { 'usage.last_used_at': new Date() },
                $inc: { 'usage.total_requests': 1 },
            }
        ).catch((err: unknown) => {
            logger.warn(`Failed to update usage for API key ${keyDoc.key_id}`, { error: String(err) });
        });

        next();
    } catch (err) {
        logger.error('Error verifying dynamic API key', err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
}

export const auth_middleware = (
    req: Request,
    res: Response,
    next: NextFunction
): void | Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        const xApiKeyHeader = req.headers['x-api-key'];

        let token: string | undefined;

        if (authHeader) {
            if (!authHeader.startsWith('Bearer ')) {
                res.status(401).json({ message: "API KEY missing in Authorization Header or 'Bearer' is missing" });
                return;
            }
            token = authHeader.slice(7).trim();
        } else if (typeof xApiKeyHeader === 'string' && xApiKeyHeader.trim().length > 0) {
            token = xApiKeyHeader.trim();
        } else if (req.headers.cookie) {
            const match = req.headers.cookie.match(/(?:^|;\s*)simplens_session=([^;]+)/);
            if (match) {
                token = decodeURIComponent(match[1]).trim();
            }
        }

        if (!token) {
            res.status(401).json({ message: "API KEY missing in Authorization Header or 'Bearer' is missing" });
            return;
        }

        // 1. Dynamic API Key (created via Dashboard / API)
        if (token.startsWith('sns_')) {
            return handleDynamicApiKey(token, req, res, next);
        }

        // 2. Admin JWT (issued for Dashboard session)
        const adminPayload = verifyAdminJwt(token);
        if (adminPayload) {
            req.user = adminPayload;
            return next();
        }

        // 3. Invalid token
        res.status(401).json({ message: 'Invalid API KEY' });
        return;
    } catch (err: unknown) {
        logger.error('Error in auth middleware', err);
        res.status(500).json({ message: 'Internal Server Error' });
        return;
    }
};