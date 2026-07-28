/**
 * Tool: list_alerts
 * List unresolved system alerts
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { ApiClient } from '../api-client.js';
import { formatApiResponse, formatToolError } from './response.js';

export function registerListAlerts(server: McpServer, getCredentials: () => UserCredentials) {
    server.registerTool(
        'list_alerts',
        {
            description:
                'List unresolved system alerts. Alerts indicate problems like ghost deliveries (status mismatch between Redis and DB), stuck processing (notifications stuck in processing state), and orphaned pending (notifications stuck in pending state). Use delete_alert to dismiss specific alerts.',
            inputSchema: {
                page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
                limit: z.number().int().min(1).max(100).optional().describe('Results per page (default: 50)'),
                type: z
                    .enum(['all', 'ghost_delivery', 'stuck_processing', 'orphaned_pending'])
                    .optional()
                    .describe('Filter by alert type (default: all)'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.listAlerts({
                    page: params.page?.toString(),
                    limit: params.limit?.toString(),
                    type: params.type,
                });
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to list alerts', error);
            }
        }
    );
}
