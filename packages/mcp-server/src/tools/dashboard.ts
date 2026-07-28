/**
 * Tools: get_dashboard_stats, get_dashboard_trends
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { ApiClient } from '../api-client.js';
import { formatApiResponse, formatToolError } from './response.js';

export function registerDashboardTools(server: McpServer, getCredentials: () => UserCredentials) {
    // 12. get_dashboard_stats
    server.registerTool(
        'get_dashboard_stats',
        {
            description: 'Fetch status counts, channel breakdowns, and general notification performance statistics.',
            inputSchema: {},
        },
        async () => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.getDashboardStats();
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to retrieve dashboard stats', error);
            }
        }
    );

    // 13. get_dashboard_trends
    server.registerTool(
        'get_dashboard_trends',
        {
            description: 'Get historical trends and sending rate patterns over a given period (24h, 7d, 30d).',
            inputSchema: {
                range: z.enum(['24h', '7d', '30d']).optional().describe('Trends historical duration range (default: 24h)')
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.getDashboardTrends(params.range);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to retrieve dashboard trends', error);
            }
        }
    );
}
