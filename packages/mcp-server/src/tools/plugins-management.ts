/**
 * Tools: Extended Plugin Lifecycle & NPM Registry Management
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { ApiClient } from '../api-client.js';
import { formatApiResponse, formatToolError } from './response.js';

export function registerPluginsManagementTools(server: McpServer, getCredentials: () => UserCredentials) {
    // 1. list_installed_plugins
    server.registerTool(
        'list_installed_plugins',
        {
            description: 'List all installed npm plugin packages persisted in MongoDB with their installation timestamp, version, and status.',
            inputSchema: {},
        },
        async () => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.listInstalledPlugins();
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to list installed plugins', error);
            }
        }
    );

    // 2. get_plugin_catalog
    server.registerTool(
        'get_plugin_catalog',
        {
            description: 'Browse the public SimpleNS plugin catalog to discover available provider plugins by category ("official" or "community").',
            inputSchema: {
                category: z.enum(['official', 'community']).describe('Plugin category: "official" for verified first-party plugins or "community" for community plugins'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.getPluginCatalog(params.category);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError(`Failed to fetch ${params.category} plugin catalog`, error);
            }
        }
    );

    // 3. install_plugin
    server.registerTool(
        'install_plugin',
        {
            description: 'Install an npm plugin package into SimpleNS. The core engine downloads, validates, and hot-loads the plugin across the cluster.',
            inputSchema: {
                package: z.string().describe('The npm package name (e.g. "@simplens/smtp", "@simplens/resend")'),
                version: z.string().optional().describe('Optional specific semver version or tag (default: "latest")'),
                auth: z.object({
                    token: z.string().optional().describe('Authentication token for private npm registry or package'),
                    registry_url: z.string().optional().describe('Custom registry URL if not installing from the default npm registry'),
                }).optional().describe('Optional authentication details for private registries or scoped packages'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.installPlugin(params);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError(`Failed to install plugin '${params.package}'`, error);
            }
        }
    );

    // 4. change_plugin_version
    server.registerTool(
        'change_plugin_version',
        {
            description: 'Upgrade or downgrade an installed plugin to a specific npm version.',
            inputSchema: {
                package: z.string().describe('The installed npm package name'),
                version: z.string().describe('The target semver version to upgrade or downgrade to (e.g. "1.2.0")'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.changePluginVersion(params);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError(`Failed to change version of plugin '${params.package}'`, error);
            }
        }
    );

    // 5. uninstall_plugin
    server.registerTool(
        'uninstall_plugin',
        {
            description: 'Uninstall a plugin package from SimpleNS. Fails if existing providers depend on this plugin.',
            inputSchema: {
                package: z.string().describe('The npm package name to uninstall (e.g. "@simplens/resend")'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.uninstallPlugin(params.package);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError(`Failed to uninstall plugin '${params.package}'`, error);
            }
        }
    );

    // 6. get_npm_auth
    server.registerTool(
        'get_npm_auth',
        {
            description: 'Retrieve configured npm registry authentication status and masked tokens.',
            inputSchema: {},
        },
        async () => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.getNpmAuth();
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to retrieve npm auth configuration', error);
            }
        }
    );

    // 7. save_npm_auth
    server.registerTool(
        'save_npm_auth',
        {
            description: 'Configure and save npm authentication credentials (auth token and optional registry URL or scope) for private package access.',
            inputSchema: {
                token: z.string().describe('NPM auth token'),
                registry_url: z.string().optional().describe('Custom NPM registry URL (e.g. "https://registry.npmjs.org/" or private Verdaccio/Artifactory URL)'),
                scope: z.string().optional().describe('Package scope to associate this auth token with (e.g. "@myorg")'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.saveNpmAuth(params);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to save npm auth configuration', error);
            }
        }
    );

    // 8. delete_npm_auth
    server.registerTool(
        'delete_npm_auth',
        {
            description: 'Delete saved npm authentication credentials for a specific scope or registry.',
            inputSchema: {
                target: z.string().optional().describe('Scope or ID identifier to remove, or omit to clear configuration'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.deleteNpmAuth(params.target);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to delete npm auth configuration', error);
            }
        }
    );
}
