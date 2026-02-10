/**
 * Tool: resolve_alert
 * Resolve/dismiss a specific alert by ID
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { DashboardApiClient } from '../api-client.js';

export function registerResolveAlert(server: McpServer, getCredentials: () => UserCredentials) {
    server.tool(
        'resolve_alert',
        'Resolve (dismiss) a specific system alert by its ID. This marks the alert as resolved. Use list_alerts first to see unresolved alerts and get their IDs.',
        {
            alert_id: z.string().describe('The MongoDB ObjectId of the alert to resolve (24-character hex string)'),
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new DashboardApiClient(credentials);
                const result = await client.resolveAlert(params.alert_id);

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
                        text: `Failed to resolve alert: ${error instanceof Error ? error.message : String(error)}`,
                    }],
                    isError: true,
                };
            }
        }
    );
}
