/**
 * Tools: Storage Provider Configuration & Management
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { ApiClient } from '../api-client.js';
import { formatApiResponse, formatToolError } from './response.js';
import { objectIdSchema } from './schemas.js';

export function registerStorageTools(server: McpServer, getCredentials: () => UserCredentials) {
    // 1. get_active_storage_status
    server.registerTool(
        'get_active_storage_status',
        {
            description: 'Check whether an active storage provider (e.g. MinIO, S3) is configured and ready in SimpleNS.',
            inputSchema: {},
        },
        async () => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.getActiveStorageProviderStatus();
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to get active storage status', error);
            }
        }
    );

    // 2. list_storage_provider_types
    server.registerTool(
        'list_storage_provider_types',
        {
            description: 'List available storage provider types and their credential schemas (e.g. minio).',
            inputSchema: {},
        },
        async () => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.getAvailableStorageProviders();
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to list available storage providers', error);
            }
        }
    );

    // 3. test_storage_connection
    server.registerTool(
        'test_storage_connection',
        {
            description: 'Test connectivity and credentials for a storage provider configuration before saving.',
            inputSchema: {
                provider_type: z.string().describe('The storage provider type (e.g. "minio")'),
                config: z.record(z.string(), z.unknown()).describe('Configuration and credential parameters (e.g. endPoint, port, accessKey, secretKey, useSSL, bucketName)'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.testStorageConnection({
                    provider_type: params.provider_type,
                    config: params.config,
                });
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to test storage connection', error);
            }
        }
    );

    // 4. list_storage_providers
    server.registerTool(
        'list_storage_providers',
        {
            description: 'List all configured storage providers in SimpleNS.',
            inputSchema: {},
        },
        async () => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.listStorageProviders();
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to list configured storage providers', error);
            }
        }
    );

    // 5. create_storage_provider
    server.registerTool(
        'create_storage_provider',
        {
            description: 'Create and register a new storage provider instance.',
            inputSchema: {
                name: z.string().min(1).describe('Human-friendly label for this storage provider'),
                provider_type: z.string().min(1).describe('Storage provider type (e.g. "minio")'),
                config: z.record(z.string(), z.unknown()).describe('Storage provider configuration parameters (e.g. endPoint, port, accessKey, secretKey, useSSL, bucketName)'),
                enabled: z.boolean().optional().describe('Whether this provider is enabled (default: true)'),
                is_active: z.boolean().optional().describe('If true, promotes this provider to the single active storage provider'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.createStorageProvider({
                    name: params.name,
                    provider_type: params.provider_type,
                    config: params.config,
                    enabled: params.enabled,
                    is_active: params.is_active,
                });
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to create storage provider', error);
            }
        }
    );

    // 6. update_storage_provider
    server.registerTool(
        'update_storage_provider',
        {
            description: 'Update settings or credentials for an existing storage provider instance.',
            inputSchema: {
                id: objectIdSchema.describe('The 24-character hexadecimal MongoDB ID of the storage provider'),
                name: z.string().optional().describe('Updated name for the storage provider'),
                config: z.record(z.string(), z.unknown()).optional().describe('Updated configuration and credentials'),
                enabled: z.boolean().optional().describe('Enable or disable this storage provider'),
                is_active: z.boolean().optional().describe('Promote this provider as the active storage provider'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const { id, ...payload } = params;
                const result = await client.updateStorageProvider(id, payload);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError(`Failed to update storage provider '${params.id}'`, error);
            }
        }
    );

    // 7. activate_storage_provider
    server.registerTool(
        'activate_storage_provider',
        {
            description: 'Promote a configured storage provider to be the single active storage provider for all file attachments.',
            inputSchema: {
                id: objectIdSchema.describe('The 24-character hexadecimal MongoDB ID of the storage provider to activate'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.activateStorageProvider(params.id);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError(`Failed to activate storage provider '${params.id}'`, error);
            }
        }
    );

    // 8. delete_storage_provider
    server.registerTool(
        'delete_storage_provider',
        {
            description: 'Delete a storage provider configuration by its MongoDB ID.',
            inputSchema: {
                id: objectIdSchema.describe('The 24-character hexadecimal MongoDB ID of the storage provider to delete'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.deleteStorageProvider(params.id);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError(`Failed to delete storage provider '${params.id}'`, error);
            }
        }
    );
}
