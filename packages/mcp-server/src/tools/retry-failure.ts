/**
 * Tool: retry_failure
 * Retry a specific failed notification by ID
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { DashboardApiClient } from '../api-client.js';

export function registerRetryFailure(server: McpServer, getCredentials: () => UserCredentials) {
    server.tool(
        'retry_failure',
        'Retry a specific failed notification by its ID. Resets the notification to pending status and re-queues it for processing. Only works on notifications with "failed" status. Use find_failures first to get notification IDs.',
        {
            notification_id: z.string().describe('The MongoDB ObjectId of the failed notification to retry (24-character hex string)'),
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new DashboardApiClient(credentials);
                const result = await client.retryFailure(params.notification_id);

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
                        text: `Failed to retry notification: ${error instanceof Error ? error.message : String(error)}`,
                    }],
                    isError: true,
                };
            }
        }
    );
}
