/**
 * Tools: resolve_alert_with_retry, bulk_resolve_alerts
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { ApiClient } from '../api-client.js';
import { formatApiResponse, formatToolError } from './response.js';
import { objectIdSchema } from './schemas.js';

export function registerResolveAlertsRetryTools(server: McpServer, getCredentials: () => UserCredentials) {
    // 10. resolve_alert_with_retry
    server.registerTool(
        'resolve_alert_with_retry',
        {
            description: 'Resolve a system alert AND retry the failed notification job. Optionally appends a warning to the template content.',
            inputSchema: {
                alert_id: objectIdSchema.describe('The MongoDB ObjectId of the alert to resolve'),
                appendWarning: z.boolean().optional().describe('Whether to append "Ignore if already received" warning to the message (default: false)')
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.resolveAlertWithRetry(params.alert_id, params.appendWarning);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to resolve alert with retry', error);
            }
        }
    );

    // 11. bulk_resolve_alerts
    server.registerTool(
        'bulk_resolve_alerts',
        {
            description: 'Resolve all unresolved system alerts in bulk and queue their notifications for retry.',
            inputSchema: {
                appendWarning: z.boolean().optional().describe('Append warning to all retried notifications'),
                limit: z.number().int().min(1).max(200).optional().describe('Limit the number of alerts resolved in this run (default: 50)')
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.bulkResolveAlerts(params);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to bulk resolve alerts', error);
            }
        }
    );
}
