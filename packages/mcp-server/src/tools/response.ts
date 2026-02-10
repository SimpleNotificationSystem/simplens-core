import type { ApiResponse } from '../api-client.js';

export function formatApiResponse(result: ApiResponse) {
    if (result.ok) {
        return {
            content: [{
                type: 'text' as const,
                text: JSON.stringify(result.data, null, 2),
            }],
        };
    }

    return {
        content: [{
            type: 'text' as const,
            text: `Error (${result.status}): ${JSON.stringify(result.data, null, 2)}`,
        }],
        isError: true,
    };
}

export function formatToolError(prefix: string, error: unknown) {
    return {
        content: [{
            type: 'text' as const,
            text: `${prefix}: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
    };
}
