/**
 * Tool: find_failures
 * Find failed notifications with optional filters
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { DashboardApiClient } from '../api-client.js';

export function registerFindFailures(server: McpServer, getCredentials: () => UserCredentials) {
    server.tool(
        'find_failures',
        'Find failed notifications with optional filtering by channel, date range, or search term. Returns paginated results with notification details and error messages.',
        {
            page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
            limit: z.number().int().min(1).max(100).optional().describe('Results per page (default: 20, max: 100)'),
            channel: z.string().optional().describe('Filter by channel (e.g. "email", "sms")'),
            search: z.string().optional().describe('Search by request_id, client_id, or client_name'),
            from: z.string().datetime().optional().describe('Filter from date (ISO datetime)'),
            to: z.string().datetime().optional().describe('Filter to date (ISO datetime)'),
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new DashboardApiClient(credentials);
                const result = await client.findFailures({
                    page: params.page?.toString(),
                    limit: params.limit?.toString(),
                    channel: params.channel,
                    search: params.search,
                    from: params.from,
                    to: params.to,
                });

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
                        text: `Failed to find failures: ${error instanceof Error ? error.message : String(error)}`,
                    }],
                    isError: true,
                };
            }
        }
    );
}
