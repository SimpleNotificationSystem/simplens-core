import type { Request, Response, NextFunction } from 'express';
import { env } from '@src/config/env.config.js';
import crypto from 'crypto';
import { apiLogger as logger } from '@src/workers/utils/logger.js';

export const auth_middleware = (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: "API KEY missing in Authorization Header or 'Bearer' is missing" });
        }
        const api_key = authHeader.split(' ')[1];

        if (!env.NS_API_KEY || typeof env.NS_API_KEY !== 'string' || env.NS_API_KEY.length === 0) {
            logger.error('NS_API_KEY is not configured in the environment.');
            return res.status(500).json({ message: 'Server configuration error' });
        }

        if (api_key && typeof api_key === 'string') {
            const apiKeyBuf = Buffer.from(api_key);
            const serverKeyBuf = Buffer.from(env.NS_API_KEY);

            // Only use timingSafeEqual if lengths are equal.
            let isValid = false;
            if (apiKeyBuf.length === serverKeyBuf.length) {
                isValid = crypto.timingSafeEqual(apiKeyBuf, serverKeyBuf);
            }
            if (isValid) {
                return next();
            }
        }
        return res.status(401).json({ message: "Invalid API KEY" });
    } catch (err: unknown) {
        logger.error(`Error in auth middleware`, err);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};