/**
 * Server Configuration
 * 
 * Loads server-level config from environment variables.
 * Per-user credentials are NOT stored here — they're extracted per-request from headers.
 */

import dotenv from 'dotenv';

dotenv.config();

export const serverConfig = {
    PORT: parseInt(process.env.PORT || '3001', 10),
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
        : ['*'],

    // Stdio-mode credentials (only used with --stdio flag)
    SIMPLENS_API_KEY: process.env.NS_API_KEY || '',
    SIMPLENS_CORE_URL: process.env.SIMPLENS_CORE_URL || 'http://localhost:3000',
    SIMPLENS_DASHBOARD_URL: process.env.SIMPLENS_DASHBOARD_URL || 'http://localhost:3002',
};
