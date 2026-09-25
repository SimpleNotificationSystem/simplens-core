/**
 * Tools: Channel Routing Configuration
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { ApiClient } from '../api-client.js';
import { formatApiResponse, formatToolError } from './response.js';

export function registerChannelRoutingTools(server: McpServer, getCredentials: () => UserCredentials) {
    // 1. list_channel_routings
    server.registerTool(
        'list_channel_routings',
        {
            description: 'List all configured channel routings, showing the primary default provider, ordered cascading fallback providers, and Kafka partitions assigned to each channel (e.g. email, sms, whatsapp).',
            inputSchema: {},
        },
        async () => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.listChannelRoutings();
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to list channel routings', error);
            }
        }
    );

    // 2. get_channel_routing
    server.registerTool(
        'get_channel_routing',
        {
            description: 'Get routing configuration for a specific communication channel (e.g. "email", "sms", "whatsapp"). Returns default provider ID, fallback provider chain, and partition count.',
            inputSchema: {
                channel: z.string().describe('Channel identifier (e.g. "email", "sms", "whatsapp", "inapp")'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.getChannelRouting(params.channel);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError(`Failed to get routing for channel '${params.channel}'`, error);
            }
        }
    );

    // 3. set_channel_routing
    server.registerTool(
        'set_channel_routing',
        {
            description: 'Set or update provider routing for a channel. Specifies the default provider to attempt first, optional ordered fallback providers if the primary fails or rate limits, and optional Kafka partitions for scaling throughput.',
            inputSchema: {
                channel: z.string().describe('Channel identifier (e.g. "email", "sms", "whatsapp")'),
                default_provider_id: z.string().describe('The primary provider ID configured in SimpleNS to route messages through'),
                fallback_provider_ids: z.array(z.string()).optional().describe('Ordered list of fallback provider IDs to cascade to if the default provider fails or is rate limited'),
                partitions: z.number().int().min(1).optional().describe('Number of Kafka topic partitions for this channel (can only be scaled up, not down)'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const { channel, ...payload } = params;
                const result = await client.setChannelRouting(channel, payload);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError(`Failed to set routing for channel '${params.channel}'`, error);
            }
        }
    );

    // 4. delete_channel_routing
    server.registerTool(
        'delete_channel_routing',
        {
            description: 'Delete routing configuration for a channel. Messages sent to this channel will fail until routing is re-configured.',
            inputSchema: {
                channel: z.string().describe('Channel identifier to delete routing for (e.g. "email", "sms")'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.deleteChannelRouting(params.channel);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError(`Failed to delete routing for channel '${params.channel}'`, error);
            }
        }
    );
}
