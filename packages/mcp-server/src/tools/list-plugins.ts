/**
 * Tool: list_plugins
 * List installed plugins and their channel/provider metadata
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { CoreApiClient } from '../api-client.js';
import { formatApiResponse, formatToolError } from './response.js';

export function registerListPlugins(server: McpServer, getCredentials: () => UserCredentials) {
    server.registerTool(
        'list_plugins',
        {
            description:
                'List all installed plugins and their metadata. Shows available channels (email, sms, whatsapp, etc), their providers, recipient fields, content fields, and priority. Use this to discover what channels and fields are available before sending notifications.',
        },
        async () => {
            try {
                const credentials = getCredentials();
                const client = new CoreApiClient(credentials);
                const result = await client.getPlugins();
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to list plugins', error);
            }
        }
    );
}
