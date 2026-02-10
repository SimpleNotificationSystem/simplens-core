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
                'Send the same notification to multiple recipients at once. Use list_plugins first to discover available channels and their required fields.',
            inputSchema: {
                client_id: z.string().uuid().describe('UUIDV4 identifier for the client/application'),
                client_name: z.string().optional().describe('Optional human-readable client name'),
                channel: z.array(z.string()).min(1).describe('Array of channels to send via'),
                provider: z.union([z.string(), z.array(z.string())]).optional().describe('Optional provider override'),
                content: z.record(z.string(), z.unknown()).describe('Shared notification content for all recipients'),
                recipients: z
                    .array(
                        z
                            .object({
                                request_id: z.string().uuid().describe('Unique UUIDV4 per recipient'),
                                user_id: z.string().describe('Recipient user identifier'),
                                variables: z
                                    .record(z.string(), z.string())
                                    .optional()
                                    .describe('Per-recipient template variables'),
                            })
                            .passthrough()
                    )
                    .describe('Array of recipients with their details'),
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
