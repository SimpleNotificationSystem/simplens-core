/**
 * Tool: find_failures
 * Find failed notifications with optional filters
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { ApiClient } from '../api-client.js';
import { formatApiResponse, formatToolError } from './response.js';
import { paginationSchemas } from './schemas.js';

export function registerFindFailures(server: McpServer, getCredentials: () => UserCredentials) {
    server.registerTool(
        'find_failures',
        {
            description:
                'Find failed notifications with optional filtering by channel, date range, or search term. Returns paginated results with notification details and error messages.',
            inputSchema: {
                ...paginationSchemas,
                channel: z.string().optional().describe('Filter by channel (e.g. "email", "sms")'),
                search: z.string().optional().describe('Search by request_id, client_id, or client_name'),
                from: z.string().datetime().optional().describe('Filter from date (ISO datetime)'),
                to: z.string().datetime().optional().describe('Filter to date (ISO datetime)'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.findFailures({
                    page: params.page?.toString(),
                    limit: params.limit?.toString(),
                    channel: params.channel,
                    search: params.search,
                    from: params.from,
                    to: params.to,
                });
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to find failures', error);
            }
        }
    );
}
