/**
 * Tool: send_notification
 * Send a single notification via any configured channel
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { CoreApiClient } from '../api-client.js';

export function registerSendNotification(server: McpServer, getCredentials: () => UserCredentials) {
    server.tool(
        'send_notification',
        'Send a single notification via any configured channel (email, whatsapp, sms, etc). Use list_plugins first to discover available channels and their required fields.',
        {
            request_id: z.string().uuid().describe('Unique UUIDV4 identifier for this request'),
            client_id: z.string().uuid().describe('UUIDV4 identifier for the client/application'),
            client_name: z.string().optional().describe('Optional human-readable name for the client'),
            channel: z.array(z.string()).describe('Array of channels to send via, e.g. ["email"] or ["email", "sms"]'),
            provider: z.array(z.string()).optional().describe('Optional array of specific providers (must match channel array length)'),
            recipient: z.record(z.string(), z.unknown()).describe('Recipient details - fields depend on the channel (e.g. { user_id: "...", email: "..." } for email)'),
            content: z.record(z.string(), z.unknown()).describe('Notification content - fields depend on the channel (e.g. { email: { subject: "...", message: "..." } })'),
            variables: z.record(z.string(), z.string()).optional().describe('Optional template variables for content interpolation'),
            webhook_url: z.string().url().describe('URL to receive delivery status callbacks'),
            scheduled_at: z.string().datetime().optional().describe('Optional ISO datetime to schedule delivery for the future'),
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new CoreApiClient(credentials);
                const result = await client.sendNotification(params);

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
                        text: `Failed to send notification: ${error instanceof Error ? error.message : String(error)}`,
                    }],
                    isError: true,
                };
            }
        }
    );
}
