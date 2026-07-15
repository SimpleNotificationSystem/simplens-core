/**
 * Tool: delete_alert
 * Dismiss/delete a specific alert by ID without retry
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { ApiClient } from '../api-client.js';
import { formatApiResponse, formatToolError } from './response.js';
import { objectIdSchema } from './schemas.js';

export function registerDeleteAlert(server: McpServer, getCredentials: () => UserCredentials) {
    server.registerTool(
        'delete_alert',
        {
            description:
                'Delete (dismiss) a specific system alert by its ID without queueing a retry of the notification. Use list_alerts first to see unresolved alerts.',
            inputSchema: {
                alert_id: objectIdSchema.describe('The MongoDB ObjectId of the alert to delete (24-character hex string)'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.deleteAlert(params.alert_id);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to delete alert', error);
            }
        }
    );
}
