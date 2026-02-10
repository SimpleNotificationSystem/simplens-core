/**
 * Tool: resolve_alert
 * Resolve/dismiss a specific alert by ID
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { DashboardApiClient } from '../api-client.js';
import { formatApiResponse, formatToolError } from './response.js';

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/);

export function registerResolveAlert(server: McpServer, getCredentials: () => UserCredentials) {
    server.registerTool(
        'resolve_alert',
        {
            description:
                'Resolve (dismiss) a specific system alert by its ID. This marks the alert as resolved. Use list_alerts first to see unresolved alerts and get their IDs.',
            inputSchema: {
                alert_id: objectId.describe('The MongoDB ObjectId of the alert to resolve (24-character hex string)'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new DashboardApiClient(credentials);
                const result = await client.resolveAlert(params.alert_id);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to resolve alert', error);
            }
        }
    );
}
