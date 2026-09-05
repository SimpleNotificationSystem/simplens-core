/**
 * SimpleNS API Client
 * 
 * Ephemeral per-request HTTP client for calling user's SimpleNS APIs.
 * Instantiated with user credentials, discarded after the response.
 */

import axios from 'axios';
import type { UserCredentials } from './auth.js';

export interface ApiResponse<T = unknown> {
    ok: boolean;
    status: number;
    data: T;
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
    let cleanBaseUrl = baseUrl;
    if (!cleanBaseUrl.endsWith('/')) {
        cleanBaseUrl = `${cleanBaseUrl}/`;
    }
    let cleanPath = path;
    if (cleanPath.startsWith('/')) {
        cleanPath = cleanPath.slice(1);
    }
    const url = new URL(cleanPath, cleanBaseUrl);

    const params: Record<string, string> = {};
    if (options.params) {
        for (const [key, value] of Object.entries(options.params)) {
            if (value !== undefined && value !== null && value !== '') {
                params[key] = String(value);
            }
        }
    }

    const response = await axios({
        url: url.toString(),
        method: options.method || 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...options.headers,
        },
        data: options.body,
        params,
        validateStatus: () => true,
    });

    return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        data: (response.data === undefined ? null : response.data) as T,
    };
}

// ============================================================================
// UNIFIED API CLIENT
// ============================================================================

export class ApiClient {
    private baseUrl: string;
    private authHeader: Record<string, string>;

    constructor(credentials: UserCredentials) {
        this.baseUrl = credentials.coreUrl;
        this.authHeader = { Authorization: `Bearer ${credentials.apiKey}` };
    }

    // Existing notification methods
    /** POST /api/notification - Send a single notification */
    async sendNotification(payload: unknown): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/notification', {
            method: 'POST',
            headers: this.authHeader,
            body: payload,
        });
    }

    /** POST /api/notification/batch - Send batch notifications */
    async sendBatchNotification(payload: unknown): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/notification/batch', {
            method: 'POST',
            headers: this.authHeader,
            body: payload,
        });
    }

    /** GET /api/plugins - List installed plugins */
    async getPlugins(): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/plugins', {
            headers: this.authHeader,
        });
    }

    // New Template CRUD methods
    /** POST /api/templates/create - Create a new notification template */
    async createTemplate(payload: unknown): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/templates/create', {
            method: 'POST',
            headers: this.authHeader,
            body: payload,
        });
    }

    /** GET /api/templates - List notification templates */
    async listTemplates(params: { package_name?: string } = {}): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/templates', {
            headers: this.authHeader,
            params: params as Record<string, string>,
        });
    }

    /** GET /api/templates/:template_id - Retrieve a single notification template by template_id */
    async getTemplateById(templateId: string): Promise<ApiResponse> {
        return request(this.baseUrl, `api/templates/${templateId}`, {
            headers: this.authHeader,
        });
    }

    /** PUT /api/templates/:template_id - Update a template by template_id */
    async updateTemplate(templateId: string, payload: unknown): Promise<ApiResponse> {
        return request(this.baseUrl, `api/templates/${templateId}`, {
            method: 'PUT',
            headers: this.authHeader,
            body: payload,
        });
    }

    /** DELETE /api/templates/:template_id - Delete a template by template_id */
    async deleteTemplate(templateId: string): Promise<ApiResponse> {
        return request(this.baseUrl, `api/templates/${templateId}`, {
            method: 'DELETE',
            headers: this.authHeader,
        });
    }

    // New Notifications Management methods
    /** GET /api/notifications - List notifications with filters */
    async listNotifications(params: {
        page?: number;
        limit?: number;
        status?: string;
        channel?: string;
        search?: string;
        from?: string;
        to?: string;
    } = {}): Promise<ApiResponse> {
        const queryParams: Record<string, string> = {};
        if (params.page !== undefined) queryParams.page = String(params.page);
        if (params.limit !== undefined) queryParams.limit = String(params.limit);
        if (params.status !== undefined) queryParams.status = params.status;
        if (params.channel !== undefined) queryParams.channel = params.channel;
        if (params.search !== undefined) queryParams.search = params.search;
        if (params.from !== undefined) queryParams.from = params.from;
        if (params.to !== undefined) queryParams.to = params.to;

        return request(this.baseUrl, 'api/notifications', {
            headers: this.authHeader,
            params: queryParams,
        });
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

    /** GET /api/notifications/recent - Get feed of recent notifications */
    async getRecentNotifications(): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/notifications/recent', {
            headers: this.authHeader,
        });
    }

    /** GET /api/notifications/:id - Retrieve a single notification by MongoDB ID */
    async getNotificationById(id: string): Promise<ApiResponse> {
        return request(this.baseUrl, `api/notifications/${id}`, {
            headers: this.authHeader,
        });
    }

    /** DELETE /api/notifications/:id - Delete a notification log */
    async deleteNotification(id: string): Promise<ApiResponse> {
        return request(this.baseUrl, `api/notifications/${id}`, {
            method: 'DELETE',
            headers: this.authHeader,
        });
    }

    /** POST /api/notifications/:id/retry - Retry a failed notification */
    async retryFailure(notificationId: string): Promise<ApiResponse> {
        return request(this.baseUrl, `api/notifications/${notificationId}/retry`, {
            method: 'POST',
            headers: this.authHeader,
        });
    }

    // Alerts & Remediation methods
    /** GET /api/alerts - List system alerts */
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

    /** DELETE /api/alerts/:id - Dismiss/delete an alert */
    async deleteAlert(alertId: string): Promise<ApiResponse> {
        return request(this.baseUrl, `api/alerts/${alertId}`, {
            method: 'DELETE',
            headers: this.authHeader,
        });
    }


    /** POST /api/alerts/:id/resolve - Resolve alert with retry */
    async resolveAlertWithRetry(alertId: string, appendWarning?: boolean): Promise<ApiResponse> {
        return request(this.baseUrl, `api/alerts/${alertId}/resolve`, {
            method: 'POST',
            headers: this.authHeader,
            body: { appendWarning: !!appendWarning },
        });
    }

    /** POST /api/alerts/bulk-resolve - Bulk resolve alerts with retry */
    async bulkResolveAlerts(params: { appendWarning?: boolean; limit?: number } = {}): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/alerts/bulk-resolve', {
            method: 'POST',
            headers: this.authHeader,
            body: {
                appendWarning: !!params.appendWarning,
                limit: params.limit || 50,
            },
        });
    }

    // Dashboard & Analytics methods
    /** GET /api/dashboard/stats - Fetch dashboard stats */
    async getDashboardStats(): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/dashboard/stats', {
            headers: this.authHeader,
        });
    }

    /** GET /api/dashboard/trends - Get historical trends */
    async getDashboardTrends(range?: string): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/dashboard/trends', {
            headers: this.authHeader,
            params: range ? { period: range } : undefined,
        });
    }

    // Admin Alert Channels CRUD and utility methods
    /** GET /api/admin-channels/providers - List alert providers */
    async listAdminChannelProviders(): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/admin-channels/providers', {
            headers: this.authHeader,
        });
    }

    /** POST /api/admin-channels/test - Test connection */
    async testAdminChannel(payload: { channel_type: string; config: Record<string, string> }): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/admin-channels/test', {
            method: 'POST',
            headers: this.authHeader,
            body: payload,
        });
    }

    /** POST /api/admin-channels/validate - Validate configuration */
    async validateAdminChannelConfig(payload: { channel_type: string; config: Record<string, string> }): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/admin-channels/validate', {
            method: 'POST',
            headers: this.authHeader,
            body: payload,
        });
    }

    /** GET /api/admin-channels - List admin channels */
    async listAdminChannels(): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/admin-channels', {
            headers: this.authHeader,
        });
    }

    /** POST /api/admin-channels - Create admin channel */
    async createAdminChannel(payload: unknown): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/admin-channels', {
            method: 'POST',
            headers: this.authHeader,
            body: payload,
        });
    }

    /** GET /api/admin-channels/:id - Get admin channel detail */
    async getAdminChannel(id: string): Promise<ApiResponse> {
        return request(this.baseUrl, `api/admin-channels/${id}`, {
            headers: this.authHeader,
        });
    }

    /** PATCH /api/admin-channels/:id - Update admin channel */
    async updateAdminChannel(id: string, payload: unknown): Promise<ApiResponse> {
        return request(this.baseUrl, `api/admin-channels/${id}`, {
            method: 'PATCH',
            headers: this.authHeader,
            body: payload,
        });
    }

    /** DELETE /api/admin-channels/:id - Delete admin channel */
    async deleteAdminChannel(id: string): Promise<ApiResponse> {
        return request(this.baseUrl, `api/admin-channels/${id}`, {
            method: 'DELETE',
            headers: this.authHeader,
        });
    }
}


