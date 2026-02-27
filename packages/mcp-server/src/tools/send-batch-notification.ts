/**
 * Tool: send_batch_notification
 * Send batch notifications to multiple recipients
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { CoreApiClient } from '../api-client.js';
import { formatApiResponse, formatToolError } from './response.js';

export function registerSendBatchNotification(server: McpServer, getCredentials: () => UserCredentials) {
    server.registerTool(
        'send_batch_notification',
        {
            description:
                'Send the same notification to multiple recipients at once.\n\n' +
                'IMPORTANT: Either template_id OR content must be provided (not neither).\n' +
                '- template_id: Array of pre-configured template IDs (one per channel).\n' +
                '- content: Inline content keyed by channel name (shared across all recipients).\n\n' +
                'Example email batch with inline content:\n' +
                '```json\n' +
                '{\n' +
                '  "client_id": "660e8400-e29b-41d4-a716-446655440001",\n' +
                '  "channel": ["email"],\n' +
                '  "content": { "email": { "subject": "Hello {{name}}!", "message": "<p>Welcome, {{name}}!</p>" } },\n' +
                '  "recipients": [\n' +
                '    { "request_id": "..uuid..", "user_id": "user1", "email": "alice@example.com", "variables": { "name": "Alice" } },\n' +
                '    { "request_id": "..uuid..", "user_id": "user2", "email": "bob@example.com", "variables": { "name": "Bob" } }\n' +
                '  ],\n' +
                '  "webhook_url": "https://your-app.com/webhook"\n' +
                '}\n' +
                '```\n\n' +
                'Use list_plugins to discover available channels and fields. Use get_send_schema for full schema documentation.',
            inputSchema: {
                client_id: z.string().uuid().describe('UUIDV4 identifier for the client/application'),
                client_name: z.string().optional().describe('Optional human-readable client name'),
                channel: z.array(z.string()).min(1).describe('Array of channels to send via'),
                template_id: z
                    .array(z.string())
                    .optional()
                    .describe(
                        'Array of pre-configured template IDs (one per channel in same order). ' +
                        'Either template_id or content must be provided.'
                    ),
                provider: z.union([z.string(), z.array(z.string())]).optional().describe('Optional provider override'),
                content: z
                    .record(z.string(), z.record(z.string(), z.string()))
                    .optional()
                    .describe(
                        'Shared notification content for all recipients, keyed by channel name. Required if template_id is not provided. ' +
                        'For email: { "email": { "subject": "Hello {{name}}", "message": "<p>Welcome!</p>" } }. ' +
                        'Use {{variable}} syntax for per-recipient personalization.'
                    ),
                recipients: z
                    .array(
                        z
                            .object({
                                request_id: z.string().uuid().describe('Unique UUIDV4 per recipient'),
                                user_id: z.string().describe('Recipient user identifier'),
                                variables: z
                                    .record(z.string(), z.string())
                                    .optional()
                                    .describe('Per-recipient template variables, e.g. { "name": "Alice" }'),
                            })
                            .passthrough()
                    )
                    .describe(
                        'Array of recipients. Each must have request_id and user_id. ' +
                        'Include channel-specific fields (e.g. "email" for email channel). ' +
                        'Example: [{ "request_id": "..uuid..", "user_id": "user1", "email": "alice@example.com" }]'
                    ),
                webhook_url: z.string().url().describe('URL to receive delivery status callbacks'),
                scheduled_at: z.string().datetime().optional().describe('Optional ISO datetime for scheduled delivery'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new CoreApiClient(credentials);
                const result = await client.sendBatchNotification(params);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to send batch notification', error);
            }
        }
    );
}
