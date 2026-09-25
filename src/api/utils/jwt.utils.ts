/**
 * Admin JWT Utilities
 * 
 * Handles generation and verification of standard RFC 7519 JSON Web Tokens (HS256)
 * for administrator authentication between Dashboard and SimpleNS Core API.
 */

import jwt from 'jsonwebtoken';
import { env } from '@src/config/env.config.js';
import type { AdminJwtPayload } from '@src/types/types.js';
import { apiLogger as logger } from '@src/workers/utils/logger.js';

const DEFAULT_EXPIRY = '7d';

/**
 * Generate a signed JWT for the authenticated admin account.
 */
export function generateAdminJwt(admin: { id: string; username: string }): string {
    const payload: AdminJwtPayload = {
        sub: admin.id,
        username: admin.username,
        role: 'admin',
    };

    return jwt.sign(payload, env.JWT_SECRET, {
        expiresIn: DEFAULT_EXPIRY,
        algorithm: 'HS256',
    });
}

/**
 * Verify and decode an Admin JWT.
 * Returns decoded payload if valid, null otherwise.
 */
export function verifyAdminJwt(token: string): AdminJwtPayload | null {
    try {
        const decoded = jwt.verify(token, env.JWT_SECRET, {
            algorithms: ['HS256'],
        }) as AdminJwtPayload;

        if (decoded && decoded.role === 'admin' && decoded.sub) {
            return decoded;
        }

        return null;
    } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
            logger.warn('Admin JWT expired', { expiredAt: err.expiredAt });
        } else if (err instanceof jwt.JsonWebTokenError) {
            logger.warn('Invalid Admin JWT signature or format', { message: err.message });
        } else {
            logger.error('Unexpected error verifying Admin JWT', err);
        }
        return null;
    }
}
