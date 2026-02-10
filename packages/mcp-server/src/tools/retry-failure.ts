/**
 * Tool: retry_failure
 * Retry a specific failed notification by ID
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { DashboardApiClient } from '../api-client.js';
import { formatApiResponse, formatToolError } from './response.js';

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/);

export function registerRetryFailure(server: McpServer, getCredentials: () => UserCredentials) {
    server.registerTool(
        'retry_failure',
        {
            description:
                'Retry a specific failed notification by its ID. Resets the notification to pending status and re-queues it for processing. Only works on notifications with "failed" status. Use find_failures first to get notification IDs.',
            inputSchema: {
                notification_id: objectId.describe(
                    'The MongoDB ObjectId of the failed notification to retry (24-character hex string)'
                ),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new DashboardApiClient(credentials);
                const result = await client.retryFailure(params.notification_id);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to retry notification', error);
            }
        }
    );
}
