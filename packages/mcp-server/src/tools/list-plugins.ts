/**
 * Tool: list_plugins
 * List installed plugins and their channel/provider metadata
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { CoreApiClient } from '../api-client.js';

export function registerListPlugins(server: McpServer, getCredentials: () => UserCredentials) {
    server.tool(
        'list_plugins',
        'List all installed plugins and their metadata. Shows available channels (email, sms, whatsapp, etc), their providers, recipient fields, content fields, and priority. Use this to discover what channels and fields are available before sending notifications.',
        {},
        async () => {
            try {
                const credentials = getCredentials();
                const client = new CoreApiClient(credentials);
                const result = await client.getPlugins();

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
                        text: `Failed to list plugins: ${error instanceof Error ? error.message : String(error)}`,
                    }],
                    isError: true,
                };
            }
        }
    );
}
