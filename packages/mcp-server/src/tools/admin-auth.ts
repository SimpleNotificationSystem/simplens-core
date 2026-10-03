/**
 * Tools: Admin Authentication & Setup Status
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { ApiClient } from '../api-client.js';
import { formatApiResponse, formatToolError } from './response.js';

export function registerAdminAuthTools(server: McpServer, getCredentials: () => UserCredentials) {
    // 1. get_admin_auth_status
    server.registerTool(
        'get_admin_auth_status',
        {
            description: 'Check whether SimpleNS administrator credentials have been configured, or whether the system is pending initial dashboard onboarding.',
            inputSchema: {},
        },
        async () => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.getAdminAuthStatus();
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to check admin auth status', error);
            }
        }
    );
}
