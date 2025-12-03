import type { Request, Response, NextFunction } from 'express';
import { env } from '@src/config/env.config.js';
import crypto from 'crypto';

export const auth_middleware = (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "API KEY missing in Authorization Header or 'Bearer' is missing" });
        }
        const api_key = authHeader.split(' ')[1];
        if(api_key){
            const isValid = api_key.length === env.NS_API_KEY.length &&
                crypto.timingSafeEqual(Buffer.from(api_key), Buffer.from(env.NS_API_KEY));
            
            if (isValid) {
                return next();
            }
        }
        return res.status(401).json({ error: "Invalid API KEY" });
    } catch (err: unknown) {
        console.error(`Error in auth middleware: ${err}`);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};