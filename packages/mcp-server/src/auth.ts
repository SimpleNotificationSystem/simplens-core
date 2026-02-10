/**
 * Authentication & Credential Extraction
 * 
 * Stateless per-request credential extraction from HTTP headers.
 * Credentials are never stored, cached, or logged.
 */

import type { Request } from 'express';
import { serverConfig } from './config.js';

export interface UserCredentials {
    apiKey: string;
    coreUrl: string;
    dashboardUrl: string;
}

/**
 * Extract user credentials from request headers.
 * Throws if required headers are missing.
 */
export function extractCredentials(req: Request): UserCredentials {
    const apiKey = req.headers['x-simplens-api-key'] as string | undefined;
    const coreUrl = req.headers['x-simplens-core-url'] as string | undefined;
    const dashboardUrl = req.headers['x-simplens-dashboard-url'] as string | undefined;

    if (!apiKey || !coreUrl || !dashboardUrl) {
        const missing: string[] = [];
        if (!apiKey) missing.push('X-SimpleNS-API-Key');
        if (!coreUrl) missing.push('X-SimpleNS-Core-URL');
        if (!dashboardUrl) missing.push('X-SimpleNS-Dashboard-URL');
        throw new Error(`Missing required headers: ${missing.join(', ')}`);
    }

    // Validate URLs
    try {
        new URL(coreUrl);
    } catch {
        throw new Error(`Invalid X-SimpleNS-Core-URL: ${coreUrl}`);
    }

    try {
        new URL(dashboardUrl);
    } catch {
        throw new Error(`Invalid X-SimpleNS-Dashboard-URL: ${dashboardUrl}`);
    }

    return { apiKey, coreUrl, dashboardUrl };
}

/**
 * Get credentials from environment variables (for stdio transport).
 */
export function getStdioCredentials(): UserCredentials {
    const { SIMPLENS_API_KEY, SIMPLENS_CORE_URL, SIMPLENS_DASHBOARD_URL } = serverConfig;

    if (!SIMPLENS_API_KEY) {
        throw new Error('NS_API_KEY environment variable is required for stdio mode');
    }

    return {
        apiKey: SIMPLENS_API_KEY,
        coreUrl: SIMPLENS_CORE_URL,
        dashboardUrl: SIMPLENS_DASHBOARD_URL,
    };
}
