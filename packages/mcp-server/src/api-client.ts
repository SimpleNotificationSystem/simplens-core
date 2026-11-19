/**
 * SimpleNS API Client
 *
 * Ephemeral per-request HTTP client for calling user's SimpleNS APIs.
 * Instantiated with user credentials, discarded after the response.
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
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
        responseType?: 'json' | 'arraybuffer' | 'text';
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

    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const defaultHeaders: Record<string, string> = {
        'Accept': 'application/json',
    };
    if (!isFormData) {
        defaultHeaders['Content-Type'] = 'application/json';
    }

    const response = await axios({
        url: url.toString(),
        method: options.method || 'GET',
        headers: {
            ...defaultHeaders,
            ...options.headers,
        },
        data: options.body,
        params,
        responseType: options.responseType || 'json',
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

    /** PUT /api/notifications/:id - Edit a failed notification and requeue it */
    async editFailedNotification(id: string, payload: unknown): Promise<ApiResponse> {
        return request(this.baseUrl, `api/notifications/${id}`, {
            method: 'PUT',
            headers: this.authHeader,
            body: payload,
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

    // ============================================================================
    // CHANNEL ROUTING
    // ============================================================================

    /** GET /api/channels/routing - List all channel routings */
    async listChannelRoutings(): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/channels/routing', {
            headers: this.authHeader,
        });
    }

    /** GET /api/channels/routing/:channel - Get routing for a specific channel */
    async getChannelRouting(channel: string): Promise<ApiResponse> {
        return request(this.baseUrl, `api/channels/routing/${encodeURIComponent(channel)}`, {
            headers: this.authHeader,
        });
    }

    /** PUT /api/channels/routing/:channel - Set or update routing for a channel */
    async setChannelRouting(channel: string, payload: {
        default_provider_id: string;
        fallback_provider_ids?: string[];
        partitions?: number;
    }): Promise<ApiResponse> {
        return request(this.baseUrl, `api/channels/routing/${encodeURIComponent(channel)}`, {
            method: 'PUT',
            headers: this.authHeader,
            body: payload,
        });
    }

    /** DELETE /api/channels/routing/:channel - Delete routing for a channel */
    async deleteChannelRouting(channel: string): Promise<ApiResponse> {
        return request(this.baseUrl, `api/channels/routing/${encodeURIComponent(channel)}`, {
            method: 'DELETE',
            headers: this.authHeader,
        });
    }

    // ============================================================================
    // PROVIDERS & RATE LIMITS
    // ============================================================================

    /** GET /api/providers - List configured providers */
    async listProviders(): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/providers', {
            headers: this.authHeader,
        });
    }

    /** GET /api/providers/:id - Get single provider by ID */
    async getProvider(id: string, includeDecrypted = false): Promise<ApiResponse> {
        return request(this.baseUrl, `api/providers/${encodeURIComponent(id)}`, {
            headers: this.authHeader,
            params: includeDecrypted ? { include_decrypted: 'true' } : undefined,
        });
    }

    /** POST /api/providers - Create a new provider */
    async createProvider(payload: {
        id: string;
        plugin_name: string;
        credentials: Record<string, unknown>;
        options?: Record<string, unknown>;
        enabled?: boolean;
    }): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/providers', {
            method: 'POST',
            headers: this.authHeader,
            body: payload,
        });
    }

    /** PUT /api/providers/:id - Update an existing provider */
    async updateProvider(id: string, payload: {
        credentials?: Record<string, unknown>;
        options?: Record<string, unknown>;
        enabled?: boolean;
    }): Promise<ApiResponse> {
        return request(this.baseUrl, `api/providers/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: this.authHeader,
            body: payload,
        });
    }

    /** DELETE /api/providers/:id - Delete a provider instance */
    async deleteProvider(id: string): Promise<ApiResponse> {
        return request(this.baseUrl, `api/providers/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: this.authHeader,
        });
    }

    /** POST /api/providers/test - Test provider connection/credentials */
    async testProvider(payload: {
        provider_id?: string;
        plugin_name?: string;
        credentials?: Record<string, unknown>;
        options?: Record<string, unknown>;
    }): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/providers/test', {
            method: 'POST',
            headers: this.authHeader,
            body: payload,
        });
    }

    /** GET /api/providers/rate-limits - Get rate limits for all providers */
    async getProvidersRateLimits(): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/providers/rate-limits', {
            headers: this.authHeader,
        });
    }

    /** GET /api/providers/:id/rate-limit - Get rate limit status for a provider */
    async getProviderRateLimit(id: string): Promise<ApiResponse> {
        return request(this.baseUrl, `api/providers/${encodeURIComponent(id)}/rate-limit`, {
            headers: this.authHeader,
        });
    }

    /** POST /api/providers/:id/rate-limit/reset - Reset rate limit for a provider */
    async resetProviderRateLimit(id: string): Promise<ApiResponse> {
        return request(this.baseUrl, `api/providers/${encodeURIComponent(id)}/rate-limit/reset`, {
            method: 'POST',
            headers: this.authHeader,
        });
    }

    // ============================================================================
    // OPERATIONAL DYNAMIC SETTINGS
    // ============================================================================

    /** GET /api/settings - Get operational settings */
    async getOperationalSettings(): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/settings', {
            headers: this.authHeader,
        });
    }

    /** PUT /api/settings - Update operational settings */
    async updateOperationalSettings(payload: Record<string, unknown>): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/settings', {
            method: 'PUT',
            headers: this.authHeader,
            body: payload,
        });
    }

    /** POST /api/settings/reset - Reset operational settings to defaults */
    async resetOperationalSettings(): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/settings/reset', {
            method: 'POST',
            headers: this.authHeader,
        });
    }

    // ============================================================================
    // EXTENDED PLUGINS & NPM AUTH
    // ============================================================================

    /** GET /api/plugins/installed - List installed plugins in MongoDB */
    async listInstalledPlugins(): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/plugins/installed', {
            headers: this.authHeader,
        });
    }

    /** GET /api/plugins/catalog/:category - Get plugin catalog */
    async getPluginCatalog(category: 'official' | 'community'): Promise<ApiResponse> {
        return request(this.baseUrl, `api/plugins/catalog/${category}`, {
            headers: this.authHeader,
        });
    }

    /** POST /api/plugins/install - Install npm plugin package */
    async installPlugin(payload: {
        package: string;
        version?: string;
        auth?: { token?: string; registry_url?: string };
    }): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/plugins/install', {
            method: 'POST',
            headers: this.authHeader,
            body: payload,
        });
    }

    /** PUT /api/plugins/version - Change version of installed plugin */
    async changePluginVersion(payload: {
        package: string;
        version: string;
    }): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/plugins/version', {
            method: 'PUT',
            headers: this.authHeader,
            body: payload,
        });
    }

    /** DELETE /api/plugins - Uninstall plugin */
    async uninstallPlugin(packageName: string): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/plugins', {
            method: 'DELETE',
            headers: this.authHeader,
            params: { package: packageName },
        });
    }

    /** GET /api/plugins/npm-auth - Get npm auth status */
    async getNpmAuth(): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/plugins/npm-auth', {
            headers: this.authHeader,
        });
    }

    /** POST /api/plugins/npm-auth - Save npm auth credentials */
    async saveNpmAuth(payload: {
        token: string;
        registry_url?: string;
        scope?: string;
    }): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/plugins/npm-auth', {
            method: 'POST',
            headers: this.authHeader,
            body: payload,
        });
    }

    /** DELETE /api/plugins/npm-auth - Delete npm auth configuration */
    async deleteNpmAuth(target?: string): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/plugins/npm-auth', {
            method: 'DELETE',
            headers: this.authHeader,
            params: target ? { id: target } : undefined,
        });
    }

    // ============================================================================
    // ADMIN AUTH STATUS
    // ============================================================================

    /** GET /api/admin/status - Check if admin credentials are configured */
    async getAdminAuthStatus(): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/auth/status', {
            headers: this.authHeader,
        });
    }

    // ============================================================================
    // STORAGE PROVIDERS
    // ============================================================================

    /** GET /api/storage/status - Get active storage provider status */
    async getActiveStorageProviderStatus(): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/storage/status', {
            headers: this.authHeader,
        });
    }

    /** GET /api/storage/providers - List available storage provider types and schemas */
    async getAvailableStorageProviders(): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/storage/providers', {
            headers: this.authHeader,
        });
    }

    /** POST /api/storage/test - Test storage connection */
    async testStorageConnection(payload: {
        provider_type: string;
        config: Record<string, unknown>;
    }): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/storage/test', {
            method: 'POST',
            headers: this.authHeader,
            body: payload,
        });
    }

    /** GET /api/storage - List all configured storage providers */
    async listStorageProviders(): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/storage', {
            headers: this.authHeader,
        });
    }

    /** POST /api/storage - Create a new storage provider */
    async createStorageProvider(payload: {
        name: string;
        provider_type: string;
        config: Record<string, unknown>;
        enabled?: boolean;
        is_active?: boolean;
    }): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/storage', {
            method: 'POST',
            headers: this.authHeader,
            body: payload,
        });
    }

    /** PATCH /api/storage/:id - Update an existing storage provider */
    async updateStorageProvider(id: string, payload: {
        name?: string;
        config?: Record<string, unknown>;
        enabled?: boolean;
        is_active?: boolean;
    }): Promise<ApiResponse> {
        return request(this.baseUrl, `api/storage/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: this.authHeader,
            body: payload,
        });
    }

    /** PATCH /api/storage/:id/activate - Promote a storage provider as active */
    async activateStorageProvider(id: string): Promise<ApiResponse> {
        return request(this.baseUrl, `api/storage/${encodeURIComponent(id)}/activate`, {
            method: 'PATCH',
            headers: this.authHeader,
        });
    }

    /** DELETE /api/storage/:id - Delete a storage provider */
    async deleteStorageProvider(id: string): Promise<ApiResponse> {
        return request(this.baseUrl, `api/storage/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: this.authHeader,
        });
    }

    // ============================================================================
    // FILE ATTACHMENTS & STORAGE
    // ============================================================================

    /** POST /api/file/upload - Upload file(s) */
    async uploadFile(options: {
        filePath?: string;
        contentBase64?: string;
        filename?: string;
        mimeType?: string;
        channel?: string;
        provider?: string;
    }): Promise<ApiResponse> {
        const formData = new FormData();

        if (options.filePath) {
            if (!fs.existsSync(options.filePath)) {
                return {
                    ok: false,
                    status: 400,
                    data: { error: `File not found on disk: ${options.filePath}` },
                };
            }
            const fileBuffer = fs.readFileSync(options.filePath);
            const filename = options.filename || path.basename(options.filePath);
            const blob = new Blob([fileBuffer], { type: options.mimeType || 'application/octet-stream' });
            formData.append('files', blob, filename);
        } else if (options.contentBase64) {
            if (!options.filename) {
                return {
                    ok: false,
                    status: 400,
                    data: { error: 'filename is required when uploading with content_base64' },
                };
            }
            const fileBuffer = Buffer.from(options.contentBase64, 'base64');
            const blob = new Blob([fileBuffer], { type: options.mimeType || 'application/octet-stream' });
            formData.append('files', blob, options.filename);
        } else {
            return {
                ok: false,
                status: 400,
                data: { error: 'Either filePath or contentBase64 must be provided' },
            };
        }

        const queryParams: Record<string, string> = {};
        if (options.channel) queryParams.channel = options.channel;
        if (options.provider) queryParams.provider = options.provider;

        return request(this.baseUrl, 'api/file/upload', {
            method: 'POST',
            headers: this.authHeader,
            body: formData,
            params: queryParams,
        });
    }

    /** GET /api/file/:id - Get file metadata */
    async getFileMetadata(id: string): Promise<ApiResponse> {
        return request(this.baseUrl, `api/file/${encodeURIComponent(id)}`, {
            headers: this.authHeader,
        });
    }

    /** GET /api/file/:id/download - Download file content */
    async downloadFile(id: string, savePath?: string): Promise<ApiResponse> {
        const result = await request<ArrayBuffer>(this.baseUrl, `api/file/${encodeURIComponent(id)}/download`, {
            headers: this.authHeader,
            responseType: 'arraybuffer',
        });

        if (!result.ok) {
            let errorData = result.data as unknown;
            if (result.data instanceof ArrayBuffer) {
                try {
                    errorData = JSON.parse(Buffer.from(result.data).toString('utf-8'));
                } catch {
                    errorData = Buffer.from(result.data).toString('utf-8');
                }
            }
            return {
                ok: false,
                status: result.status,
                data: errorData,
            };
        }

        const buffer = Buffer.from(result.data);
        if (savePath) {
            fs.writeFileSync(savePath, buffer);
            return {
                ok: true,
                status: result.status,
                data: {
                    message: `File downloaded successfully and saved to ${savePath}`,
                    saved_to: savePath,
                    size: buffer.byteLength,
                },
            };
        }

        return {
            ok: true,
            status: result.status,
            data: {
                size: buffer.byteLength,
                content_base64: buffer.byteLength <= 10 * 1024 * 1024 ? buffer.toString('base64') : undefined,
                note: buffer.byteLength > 10 * 1024 * 1024 ? 'File is larger than 10MB; provide save_path to save directly to disk.' : undefined,
            },
        };
    }

    // ============================================================================
    // SERVICE HEALTH & DIAGNOSTICS
    // ============================================================================

    /** GET /api/health - Check service health and dependency readiness */
    async getHealthStatus(): Promise<ApiResponse> {
        return request(this.baseUrl, 'api/health', {
            headers: this.authHeader,
        });
    }
}
