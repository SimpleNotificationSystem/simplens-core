/**
 * Tools: Dynamic Operational Configuration Settings
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { ApiClient } from '../api-client.js';
import { formatApiResponse, formatToolError } from './response.js';

export function registerSettingsTools(server: McpServer, getCredentials: () => UserCredentials) {
    // 1. get_operational_settings
    server.registerTool(
        'get_operational_settings',
        {
            description: 'Retrieve current dynamic operational settings (worker concurrency, retry limits, delayed and recovery intervals, failure alert thresholds).',
            inputSchema: {},
        },
        async () => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.getOperationalSettings();
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to get operational settings', error);
            }
        }
    );

    // 2. update_operational_settings
    server.registerTool(
        'update_operational_settings',
        {
            description: 'Hot-update operational settings across the SimpleNS cluster without requiring service restarts. Changes are broadcast via Redis pub/sub.',
            inputSchema: {
                settings: z.record(z.string(), z.unknown()).describe('Partial operational settings object to merge and update (e.g. { notification_worker: { batch_size: 20 }, delayed_processor: { poll_interval_ms: 3000 } })'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.updateOperationalSettings(params.settings);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to update operational settings', error);
            }
        }
    );

    // 3. reset_operational_settings
    server.registerTool(
        'reset_operational_settings',
        {
            description: 'Reset all dynamic operational settings back to initial system defaults.',
            inputSchema: {},
        },
        async () => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.resetOperationalSettings();
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to reset operational settings', error);
            }
        }
    );
}
