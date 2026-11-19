/**
 * Tool: edit_failed_notification
 * Edit a failed notification's content/config and atomically re-queue it
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { ApiClient } from '../api-client.js';
import { formatApiResponse, formatToolError } from './response.js';
import { objectIdSchema } from './schemas.js';

export function registerEditFailedNotification(server: McpServer, getCredentials: () => UserCredentials) {
    server.registerTool(
        'edit_failed_notification',
        {
            description:
                'Edit a failed notification and atomically re-queue it for processing.\n\n' +
                'Only notifications with "failed" status can be edited; use find_failures or list_notifications (status: "failed") to get an ID.\n\n' +
                'Editable fields (at least one required):\n' +
                '- content: Inline content stored as-is. "{{variables}}" placeholders are allowed and are rendered from `variables` once at dispatch. Ignored when template_id is supplied.\n' +
                '- template_id: Replaces `content` with the template content. The template package must match the provider package.\n' +
                '- variables: String values used to render content placeholders. Pass null (or an empty object) to clear stored variables.\n' +
                '- provider: Provider ID to switch to; must serve the notification channel. Pass null to revert to the channel default.\n' +
                '- recipient: Recipient object, validated against the provider recipient schema.\n' +
                '- webhook_url: URL for delivery status callbacks. Omit to keep the current value (it cannot be cleared).\n' +
                '- scheduled_at: ISO datetime for delayed delivery. Pass null to clear the schedule.\n\n' +
                'Unknown fields (such as retry_count or status) are rejected. When both template_id and content are supplied, template_id wins but any attachments in content are preserved.',
            inputSchema: {
                notification_id: objectIdSchema.describe(
                    'The MongoDB ObjectId of the failed notification to edit (24-character hex string)'
                ),
                provider: z
                    .string()
                    .nullable()
                    .optional()
                    .describe('Provider ID to switch to; null reverts to the channel default provider'),
                template_id: z
                    .string()
                    .nullable()
                    .optional()
                    .describe('Template ID whose content replaces the inline content'),
                recipient: z
                    .record(z.string(), z.unknown())
                    .optional()
                    .describe('Recipient object matching the provider recipient schema'),
                content: z
                    .record(z.string(), z.unknown())
                    .optional()
                    .describe('Inline content (raw); "{{variable}}" placeholders are rendered at dispatch'),
                variables: z
                    .record(z.string(), z.string())
                    .nullable()
                    .optional()
                    .describe('String values for content placeholders; null or {} clears stored variables'),
                webhook_url: z
                    .string()
                    .url()
                    .optional()
                    .describe('URL to receive delivery status callbacks; omit to keep the current value'),
                scheduled_at: z
                    .string()
                    .datetime()
                    .nullable()
                    .optional()
                    .describe('ISO datetime for delayed delivery; null clears the schedule'),
            },
        },
        async (params) => {
            const { notification_id, ...rest } = params;

            // Only forward supplied fields: the API request body is strict, and
            // an explicit null is meaningful (clear / revert to default).
            const payload: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(rest)) {
                if (value !== undefined) {
                    payload[key] = value;
                }
            }

            if (Object.keys(payload).length === 0) {
                return {
                    content: [{
                        type: 'text' as const,
                        text: 'No editable fields provided. Supply at least one of: provider, template_id, recipient, content, variables, webhook_url, scheduled_at. To retry without changes, use retry_failure.',
                    }],
                    isError: true,
                };
            }

            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.editFailedNotification(notification_id, payload);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to edit notification', error);
            }
        }
    );
}
