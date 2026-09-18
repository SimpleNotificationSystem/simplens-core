/**
 * Admin Authentication & Initial Setup Controller
 * 
 * Manages first-time administrator account onboarding, authentication status checks,
 * and credential verification using crypto.scrypt hashing and constant-time comparison.
 */

import { Request, Response } from 'express';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import system_config_model from '@src/database/models/system-config.models.js';
import { adminSetupSchema, adminLoginSchema } from '@src/types/schemas.js';
import type { AdminCredentialsDoc } from '@src/types/types.js';
import { apiLogger as logger } from '@src/workers/utils/logger.js';

export const ADMIN_CREDENTIALS_KEY = 'admin_credentials';

/**
 * Check if the administrator credentials have been configured
 * GET /api/admin/auth/status
 */
export const getAuthStatus = async (_req: Request, res: Response): Promise<void> => {
    try {
        const doc = await system_config_model.findOne({ key: ADMIN_CREDENTIALS_KEY });
        const isConfigured = Boolean(doc?.value);

        res.status(200).json({ isConfigured });
    } catch (err) {
        logger.error('Failed to query admin auth status', err);
        res.status(500).json({ error: 'Internal server error checking admin auth status' });
    }
};

/**
 * Configure administrator account on initial setup
 * POST /api/admin/auth/setup
 */
export const setupAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const validation = adminSetupSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                error: 'Validation failed',
                details: validation.error.flatten().fieldErrors,
            });
            return;
        }

        const { username, password } = validation.data;

        // Check if already configured
        const existingDoc = await system_config_model.findOne({ key: ADMIN_CREDENTIALS_KEY });
        if (existingDoc?.value) {
            res.status(400).json({
                error: 'Administrator credentials have already been configured. Initial setup is locked.',
            });
            return;
        }

        // Generate cryptographic salt and scrypt hash
        const salt = randomBytes(32).toString('hex');
        const password_hash = scryptSync(password, salt, 64).toString('hex');

        const credentialsData: AdminCredentialsDoc = {
            username,
            password_hash,
            salt,
            created_at: new Date().toISOString(),
        };

        await system_config_model.create({
            key: ADMIN_CREDENTIALS_KEY,
            value: credentialsData,
        });

        logger.success(`Administrator account configured successfully for username: ${username}`);

        res.status(201).json({
            success: true,
            message: 'Administrator account configured successfully.',
            user: {
                id: 'admin-1',
                username,
            },
        });
    } catch (err) {
        logger.error('Error during administrator setup', err);
        res.status(500).json({ error: 'Failed to configure administrator account' });
    }
};

/**
 * Verify administrator credentials
 * POST /api/admin/auth/verify
 */
export const verifyAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const validation = adminLoginSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                isValid: false,
                message: 'Username and password are required',
            });
            return;
        }

        const { username, password } = validation.data;

        const doc = await system_config_model.findOne({ key: ADMIN_CREDENTIALS_KEY });

        if (doc?.value) {
            const credentials = doc.value as AdminCredentialsDoc;

            // Username match check
            if (credentials.username !== username) {
                res.status(401).json({ isValid: false, message: 'Invalid username or password' });
                return;
            }

            // Compute scrypt hash with stored salt
            const computedHash = scryptSync(password, credentials.salt, 64).toString('hex');
            const storedHashBuf = Buffer.from(credentials.password_hash, 'hex');
            const computedHashBuf = Buffer.from(computedHash, 'hex');

            if (storedHashBuf.length === computedHashBuf.length && timingSafeEqual(storedHashBuf, computedHashBuf)) {
                res.status(200).json({
                    isValid: true,
                    user: { id: 'admin-1', username: credentials.username },
                });
                return;
            }

            res.status(401).json({ isValid: false, message: 'Invalid username or password' });
            return;
        }

        // Fallback check against process.env if present
        const envUser = process.env.ADMIN_USERNAME;
        const envPass = process.env.ADMIN_PASSWORD;
        if (envUser && envPass && username === envUser && password === envPass) {
            res.status(200).json({
                isValid: true,
                user: { id: 'admin-1', username: envUser },
            });
            return;
        }

        res.status(401).json({ isValid: false, message: 'Invalid username or password' });
    } catch (err) {
        logger.error('Error verifying administrator credentials', err);
        res.status(500).json({ error: 'Failed to verify administrator credentials' });
    }
};
