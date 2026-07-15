/**
 * Tool: Notifications Management
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { ApiClient } from '../api-client.js';
import { formatApiResponse, formatToolError } from './response.js';

import { objectIdSchema, paginationSchemas } from './schemas.js';

export function registerNotificationsManagementTools(server: McpServer, getCredentials: () => UserCredentials) {
    // 6. list_notifications
    server.registerTool(
        'list_notifications',
        {
            description: 'List notifications with advanced filtering, sorting, and pagination. (Use find_failures for failed-only alerts).',
            inputSchema: {
                ...paginationSchemas,
                status: z.string().optional().describe('Filter by status (e.g. "pending", "processing", "sent", "failed")'),
                channel: z.string().optional().describe('Filter by channel (e.g. "email", "sms")'),
                search: z.string().optional().describe('Search by request ID, client ID, or client name'),
                from: z.string().datetime().optional().describe('Filter from ISO date'),
                to: z.string().datetime().optional().describe('Filter to ISO date')
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.listNotifications(params);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to list notifications', error);
            }
        }
    );

    // 7. get_recent_notifications
    server.registerTool(
        'get_recent_notifications',
        {
            description: 'Get a feed of recent notifications (activity feed/logs).',
            inputSchema: {},
        },
        async () => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.getRecentNotifications();
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to retrieve recent notifications', error);
            }
        }
    );

    // 8. get_notification_by_id
    server.registerTool(
        'get_notification_by_id',
        {
            description: 'Retrieve full status, configuration, and error logs for a single notification by its internal MongoDB ID.',
            inputSchema: {
                id: objectIdSchema.describe('The 24-character hexadecimal MongoDB ID of the notification')
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.getNotificationById(params.id);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to retrieve notification', error);
            }
        }
    );

    // 9. delete_notification
    server.registerTool(
        'delete_notification',
        {
            description: 'Delete a notification log from the database.',
            inputSchema: {
                id: objectIdSchema.describe('The 24-character hexadecimal MongoDB ID of the notification to delete')
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.deleteNotification(params.id);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to delete notification', error);
            }
        }
    );
}
