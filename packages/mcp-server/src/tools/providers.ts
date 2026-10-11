/**
 * Tools: Provider Management & Rate Limiting
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { ApiClient } from '../api-client.js';
import { formatApiResponse, formatToolError } from './response.js';

export function registerProviderTools(server: McpServer, getCredentials: () => UserCredentials) {
    // 1. list_providers
    server.registerTool(
        'list_providers',
        {
            description: 'List all configured provider instances across all notification channels, including their plugin package name, enabled status, and provider options.',
            inputSchema: {},
        },
        async () => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.listProviders();
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to list providers', error);
            }
        }
    );

    // 2. get_provider
    server.registerTool(
        'get_provider',
        {
            description: 'Retrieve detailed configuration and status for a single provider instance by its ID. Credentials are masked by default.',
            inputSchema: {
                id: z.string().describe('Unique identifier of the provider instance (e.g. "sendgrid-primary", "twilio-marketing")'),
                include_decrypted: z.boolean().optional().describe('Whether to reveal decrypted credentials instead of masked values (default: false)'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.getProvider(params.id, params.include_decrypted);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError(`Failed to get provider '${params.id}'`, error);
            }
        }
    );

    // 3. create_provider
    server.registerTool(
        'create_provider',
        {
            description: 'Instantiate and register a new provider with required credentials, options (e.g. rate limits), and enable state.',
            inputSchema: {
                id: z.string().describe('Unique user-defined identifier for this provider instance (e.g. "sendgrid-backup", "resend-prod")'),
                plugin_name: z.string().describe('The installed plugin package name that powers this provider (e.g. "@simplens/smtp", "@simplens/sendgrid")'),
                credentials: z.record(z.string(), z.unknown()).describe('Credential object matching the plugin schema (e.g. { apiKey: "..." } or { host: "...", port: 587 })'),
                options: z.record(z.string(), z.unknown()).optional().describe('Optional provider parameters such as rate limits { rateLimit: { windowMs: 60000, maxRequests: 100 } }'),
                enabled: z.boolean().optional().describe('Whether the provider is immediately active and available for routing (default: true)'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.createProvider(params);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError(`Failed to create provider '${params.id}'`, error);
            }
        }
    );

    // 4. update_provider
    server.registerTool(
        'update_provider',
        {
            description: 'Update credentials, options, or enabled status of an existing provider instance.',
            inputSchema: {
                id: z.string().describe('Provider instance ID to update'),
                credentials: z.record(z.string(), z.unknown()).optional().describe('New credentials object (only provide fields you want to update or overwrite)'),
                options: z.record(z.string(), z.unknown()).optional().describe('Updated provider options or rate limits'),
                enabled: z.boolean().optional().describe('Toggle provider enabled status'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const { id, ...payload } = params;
                const result = await client.updateProvider(id, payload);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError(`Failed to update provider '${params.id}'`, error);
            }
        }
    );

    // 5. delete_provider
    server.registerTool(
        'delete_provider',
        {
            description: 'Delete a provider instance. Fails if the provider is currently referenced as a primary or fallback provider in channel routing.',
            inputSchema: {
                id: z.string().describe('Provider ID to delete'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.deleteProvider(params.id);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError(`Failed to delete provider '${params.id}'`, error);
            }
        }
    );

    // 6. test_provider
    server.registerTool(
        'test_provider',
        {
            description: 'Test provider connection and credentials without saving to the database. Can test an existing provider by provider_id or test raw un-persisted credentials.',
            inputSchema: {
                provider_id: z.string().optional().describe('ID of an existing saved provider to test'),
                plugin_name: z.string().optional().describe('Plugin package name to test (required if testing new raw credentials)'),
                credentials: z.record(z.string(), z.unknown()).optional().describe('Credentials to test against the provider service'),
                options: z.record(z.string(), z.unknown()).optional().describe('Optional parameters to test with'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.testProvider(params);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to test provider connection', error);
            }
        }
    );

    // 7. get_providers_rate_limits
    server.registerTool(
        'get_providers_rate_limits',
        {
            description: 'Get real-time rate limiter status, token bucket counts, and telemetry across all configured providers in Redis.',
            inputSchema: {},
        },
        async () => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.getProvidersRateLimits();
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to retrieve providers rate limits', error);
            }
        }
    );

    // 8. get_provider_rate_limit
    server.registerTool(
        'get_provider_rate_limit',
        {
            description: 'Get real-time rate limit status, remaining token capacity, and reset window for a specific provider instance.',
            inputSchema: {
                id: z.string().describe('Provider instance ID'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.getProviderRateLimit(params.id);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError(`Failed to retrieve rate limit for provider '${params.id}'`, error);
            }
        }
    );

    // 9. reset_provider_rate_limit
    server.registerTool(
        'reset_provider_rate_limit',
        {
            description: 'Manually reset rate limiter tokens and telemetry counters for a specific provider instance in Redis.',
            inputSchema: {
                id: z.string().describe('Provider instance ID to reset rate limiter for'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.resetProviderRateLimit(params.id);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError(`Failed to reset rate limit for provider '${params.id}'`, error);
            }
        }
    );
}
