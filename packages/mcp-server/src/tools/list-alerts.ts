/**
 * Tool: list_alerts
 * List unresolved system alerts
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { DashboardApiClient } from '../api-client.js';

export function registerListAlerts(server: McpServer, getCredentials: () => UserCredentials) {
    server.tool(
        'list_alerts',
        'List unresolved system alerts. Alerts indicate problems like ghost deliveries (status mismatch between Redis and DB), stuck processing (notifications stuck in processing state), and orphaned pending (notifications stuck in pending state). Use resolve_alert to dismiss specific alerts.',
        {
            page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
            limit: z.number().int().min(1).max(100).optional().describe('Results per page (default: 50)'),
            type: z.enum(['all', 'ghost_delivery', 'stuck_processing', 'orphaned_pending']).optional()
                .describe('Filter by alert type (default: all)'),
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new DashboardApiClient(credentials);
                const result = await client.listAlerts({
                    page: params.page?.toString(),
                    limit: params.limit?.toString(),
                    type: params.type,
                });

                if (result.ok) {
                    return {
                        content: [{
                            type: 'text' as const,
                            text: JSON.stringify(result.data, null, 2),
                        }],
                    };
                } else {
                    return {
                        content: [{
                            type: 'text' as const,
                            text: `Error (${result.status}): ${JSON.stringify(result.data, null, 2)}`,
                        }],
                        isError: true,
                    };
                }
            } catch (error) {
                return {
                    content: [{
                        type: 'text' as const,
                        text: `Failed to list alerts: ${error instanceof Error ? error.message : String(error)}`,
                    }],
                    isError: true,
                };
            }
        }
    );
}
