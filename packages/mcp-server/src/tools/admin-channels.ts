/**
 * Tools: Admin Alert Channel Configurations
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { ApiClient } from '../api-client.js';
import { formatApiResponse, formatToolError } from './response.js';

import { objectIdSchema } from './schemas.js';
const providerType = z.enum(['discord', 'telegram', 'email', 'slack']);

export function registerAdminChannelsTools(server: McpServer, getCredentials: () => UserCredentials) {
    // 14. list_admin_channel_providers
    server.registerTool(
        'list_admin_channel_providers',
        {
            description: 'List available system alert providers (Discord, Telegram, Slack) with their required configuration forms and schemas. AI agents should run this before creating or updating a channel.',
            inputSchema: {},
        },
        async () => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.listAdminChannelProviders();
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to list admin channel providers', error);
            }
        }
    );

    // 15. test_admin_channel
    server.registerTool(
        'test_admin_channel',
        {
            description: 'Test sending a test message to an admin channel without saving its configuration to verify credentials.',
            inputSchema: {
                channel_type: providerType.describe('Provider type'),
                config: z.record(z.string(), z.string()).describe('Raw connection credentials matching the provider\'s schema (e.g. webhook_url)')
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.testAdminChannel(params);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to test admin channel connection', error);
            }
        }
    );

    // 16. validate_admin_channel_config
    server.registerTool(
        'validate_admin_channel_config',
        {
            description: 'Validate credential keys and formats against the provider\'s schema without triggering any HTTP requests.',
            inputSchema: {
                channel_type: providerType.describe('Provider type'),
                config: z.record(z.string(), z.string()).describe('Credential object to validate')
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.validateAdminChannelConfig(params);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to validate admin channel config', error);
            }
        }
    );

    // 17. list_admin_channels
    server.registerTool(
        'list_admin_channels',
        {
            description: 'Retrieve all registered admin alert channels. (Encrypted credentials are excluded for security).',
            inputSchema: {},
        },
        async () => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.listAdminChannels();
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to list admin channels', error);
            }
        }
    );

    // 18. create_admin_channel
    server.registerTool(
        'create_admin_channel',
        {
            description: 'Configure and register a new admin alert channel. Validates credentials against provider schema automatically.',
            inputSchema: {
                channel_type: providerType.describe('Provider type'),
                name: z.string().min(1).describe('User-friendly nickname for this channel (e.g., "Developer Discord Alert")'),
                config: z.record(z.string(), z.string()).describe('Credentials config matching provider requirements'),
                alert_filters: z.object({
                    failed_notifications: z.boolean().default(true),
                    service_health: z.boolean().default(true),
                    stuck_processing: z.boolean().default(true),
                    orphaned_pending: z.boolean().default(true),
                    ghost_delivery: z.boolean().default(false)
                }).optional().describe('Which types of system alert trigger this channel')
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.createAdminChannel(params);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to create admin channel', error);
            }
        }
    );

    // 19. get_admin_channel
    server.registerTool(
        'get_admin_channel',
        {
            description: 'Get a single admin alert channel configuration by MongoDB ID (excluding encrypted credentials).',
            inputSchema: {
                id: objectIdSchema.describe('The MongoDB ID of the channel')
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.getAdminChannel(params.id);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to retrieve admin channel', error);
            }
        }
    );

    // 20. update_admin_channel
    server.registerTool(
        'update_admin_channel',
        {
            description: 'Update an admin alert channel configuration.',
            inputSchema: {
                id: objectIdSchema.describe('The MongoDB ID of the channel to update'),
                name: z.string().optional().describe('Updated channel label'),
                enabled: z.boolean().optional().describe('Toggle channel enablement'),
                config: z.record(z.string(), z.string()).optional().describe('New credentials (validates automatically)'),
                alert_filters: z.object({
                    failed_notifications: z.boolean(),
                    service_health: z.boolean(),
                    stuck_processing: z.boolean(),
                    orphaned_pending: z.boolean(),
                    ghost_delivery: z.boolean()
                }).partial().optional().describe('Updated alert filters')
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const { id, ...payload } = params;
                const result = await client.updateAdminChannel(id, payload);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to update admin channel', error);
            }
        }
    );

    // 21. delete_admin_channel
    server.registerTool(
        'delete_admin_channel',
        {
            description: 'Delete an admin alert channel.',
            inputSchema: {
                id: objectIdSchema.describe('The MongoDB ID of the channel to delete')
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.deleteAdminChannel(params.id);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to delete admin channel', error);
            }
        }
    );
}
