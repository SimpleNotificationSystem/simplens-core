/**
 * Tool: send_notification
 * Send a single notification via any configured channel
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { CoreApiClient } from '../api-client.js';
import { formatApiResponse, formatToolError } from './response.js';

export function registerSendNotification(server: McpServer, getCredentials: () => UserCredentials) {
    server.registerTool(
        'send_notification',
        {
            description:
                'Send a single notification via any configured channel (email, whatsapp, sms, etc).\n\n' +
                'IMPORTANT: Either template_id OR content must be provided (not neither).\n' +
                '- template_id: Array of pre-configured template IDs (one per channel). Use list_plugins to find available templates.\n' +
                '- content: Inline content keyed by channel name.\n\n' +
                'Example email with inline content:\n' +
                '```json\n' +
                '{\n' +
                '  "request_id": "550e8400-e29b-41d4-a716-446655440000",\n' +
                '  "client_id": "660e8400-e29b-41d4-a716-446655440001",\n' +
                '  "channel": ["email"],\n' +
                '  "recipient": { "user_id": "user123", "email": "user@example.com" },\n' +
                '  "content": { "email": { "subject": "Hello", "message": "<p>Welcome!</p>" } },\n' +
                '  "webhook_url": "https://your-app.com/webhook"\n' +
                '}\n' +
                '```\n\n' +
                'Example with template:\n' +
                '```json\n' +
                '{\n' +
                '  "request_id": "550e8400-e29b-41d4-a716-446655440000",\n' +
                '  "client_id": "660e8400-e29b-41d4-a716-446655440001",\n' +
                '  "channel": ["email"],\n' +
                '  "template_id": ["welcome-email"],\n' +
                '  "recipient": { "user_id": "user123", "email": "user@example.com" },\n' +
                '  "variables": { "name": "John" },\n' +
                '  "webhook_url": "https://your-app.com/webhook"\n' +
                '}\n' +
                '```\n\n' +
                'Use list_plugins to discover available channels and their required fields. Use get_send_schema for full schema documentation.',
            inputSchema: {
                request_id: z.string().uuid().describe('Unique UUIDV4 identifier for this request'),
                client_id: z.string().uuid().describe('UUIDV4 identifier for the client/application'),
                client_name: z.string().optional().describe('Optional human-readable name for the client'),
                channel: z
                    .array(z.string())
                    .min(1)
                    .describe('Array of channels to send via, e.g. ["email"] or ["email", "sms"]'),
                template_id: z
                    .array(z.string())
                    .optional()
                    .describe(
                        'Array of pre-configured template IDs (one per channel in same order). ' +
                        'Either template_id or content must be provided. ' +
                        'Example: ["welcome-email"] when channel is ["email"]'
                    ),
                provider: z
                    .array(z.string())
                    .optional()
                    .describe('Optional array of specific providers (must match channel array length)'),
                recipient: z
                    .record(z.string(), z.unknown())
                    .describe(
                        'Recipient details (fields depend on channel). ' +
                        'For email: { "user_id": "user123", "email": "user@example.com" }. ' +
                        'For SMS: { "user_id": "user123", "phone": "+1234567890" }. ' +
                        'Always include user_id. Use list_plugins to see all channel-specific fields.'
                    ),
                content: z
                    .record(z.string(), z.record(z.string(), z.string()))
                    .optional()
                    .describe(
                        'Notification content keyed by channel name. Required if template_id is not provided. ' +
                        'For email: { "email": { "subject": "Subject line", "message": "<h1>HTML body</h1>" } }. ' +
                        'For SMS: { "sms": { "message": "Text message" } }. ' +
                        'Use list_plugins to see required content fields per channel.'
                    ),
                variables: z
                    .record(z.string(), z.string())
                    .optional()
                    .describe('Optional template variables for content interpolation, e.g. { "name": "John", "code": "1234" }'),
                webhook_url: z.string().url().describe('URL to receive delivery status callbacks'),
                scheduled_at: z.string().datetime().optional().describe('Optional ISO datetime to schedule delivery for the future'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new CoreApiClient(credentials);
                const result = await client.sendNotification(params);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to send notification', error);
            }
        }
    );
}
