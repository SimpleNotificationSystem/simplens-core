/**
 * Tools: Service Health & Diagnostics
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { ApiClient } from '../api-client.js';
import { formatApiResponse, formatToolError } from './response.js';

export function registerHealthTools(server: McpServer, getCredentials: () => UserCredentials) {
    // 1. get_health_status
    server.registerTool(
        'get_health_status',
        {
            description: 'Check the health and readiness status of the SimpleNS API service and its connected dependencies (MongoDB, Redis).',
            inputSchema: {},
        },
        async () => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.getHealthStatus();
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to get health status', error);
            }
        }
    );
}
