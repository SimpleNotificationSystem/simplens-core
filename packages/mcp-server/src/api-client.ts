/**
 * SimpleNS API Client
 * 
 * Ephemeral per-request HTTP client for calling user's SimpleNS APIs.
 * Instantiated with user credentials, discarded after the response.
 */

import type { UserCredentials } from './auth.js';

export interface ApiResponse<T = unknown> {
    ok: boolean;
    status: number;
    data: T;
}

function isLikelyJson(contentType: string | null, bodyText: string): boolean {
    if (contentType && contentType.toLowerCase().includes('application/json')) {
        return true;
    }
    const trimmed = bodyText.trim();
    return trimmed.startsWith('{') || trimmed.startsWith('[');
}

async function request<T = unknown>(
    baseUrl: string,
    path: string,
    options: {
        method?: string;
        headers?: Record<string, string>;
        body?: unknown;
        params?: Record<string, string>;
    } = {}
): Promise<ApiResponse<T>> {
    const url = new URL(path, baseUrl);

    if (options.params) {
        for (const [key, value] of Object.entries(options.params)) {
            if (value !== undefined && value !== '') {
                url.searchParams.set(key, value);
            }
        }
    }

    const response = await fetch(url.toString(), {
        method: options.method || 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const text = await response.text();
    let data: T | string | null;
    if (!text) {
        data = null;
    } else if (isLikelyJson(response.headers.get('content-type'), text)) {
        try {
            data = JSON.parse(text) as T;
        } catch {
            data = text;
        }
    } else {
        data = text;
    }

    return {
        ok: response.ok,
        status: response.status,
        data: data as T,
    };
}

// ============================================================================
// CORE API CLIENT
// ============================================================================

export class CoreApiClient {
    private baseUrl: string;
    private authHeader: Record<string, string>;

    constructor(credentials: UserCredentials) {
        this.baseUrl = credentials.coreUrl;
        this.authHeader = { Authorization: `Bearer ${credentials.apiKey}` };
    }

    /** POST /api/notification - Send a single notification */
    async sendNotification(payload: unknown): Promise<ApiResponse> {
        return request(this.baseUrl, '/api/notification', {
            method: 'POST',
            headers: this.authHeader,
            body: payload,
        });
    }

    /** POST /api/notification/batch - Send batch notifications */
    async sendBatchNotification(payload: unknown): Promise<ApiResponse> {
        return request(this.baseUrl, '/api/notification/batch', {
            method: 'POST',
            headers: this.authHeader,
            body: payload,
        });
    }

    /** GET /api/plugins - List installed plugins */
    async getPlugins(): Promise<ApiResponse> {
        return request(this.baseUrl, '/api/plugins');
    }
}

// ============================================================================
// DASHBOARD API CLIENT
// ============================================================================

export class DashboardApiClient {
    private baseUrl: string;
    private authHeader: Record<string, string>;

    constructor(credentials: UserCredentials) {
        this.baseUrl = credentials.dashboardUrl.endsWith('/')
            ? credentials.dashboardUrl
            : `${credentials.dashboardUrl}/`;
        this.authHeader = { Authorization: `Bearer ${credentials.apiKey}` };
    }

    /** GET /api/notifications?status=failed - Find failed notifications */
    async findFailures(params: {
        page?: string;
        limit?: string;
        channel?: string;
        search?: string;
        from?: string;
        to?: string;
    } = {}): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/notifications', {
            headers: this.authHeader,
            params: {
                status: 'failed',
                page: params.page || '1',
                limit: params.limit || '20',
                ...(params.channel && { channel: params.channel }),
                ...(params.search && { search: params.search }),
                ...(params.from && { from: params.from }),
                ...(params.to && { to: params.to }),
            },
        });
    }

    /** POST /api/notifications/[id]/retry - Retry a failed notification */
    async retryFailure(notificationId: string): Promise<ApiResponse> {
        return request(this.baseUrl, `api/notifications/${notificationId}/retry`, {
            method: 'POST',
            headers: this.authHeader,
        });
    }

    /** GET /api/alerts - List unresolved alerts */
    async listAlerts(params: {
        page?: string;
        limit?: string;
        type?: string;
    } = {}): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/alerts', {
            headers: this.authHeader,
            params: {
                page: params.page || '1',
                limit: params.limit || '50',
                ...(params.type && { type: params.type }),
            },
        });
    }

    /** DELETE /api/alerts/[id] - Resolve/dismiss an alert */
    async resolveAlert(alertId: string): Promise<ApiResponse> {
        return request(this.baseUrl, `api/alerts/${alertId}`, {
            method: 'DELETE',
            headers: this.authHeader,
        });
    }
}
