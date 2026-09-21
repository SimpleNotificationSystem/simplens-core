/**
 * Dashboard API Client
 * Centralized client-side fetch wrapper using Axios
 */
import axios, { AxiosError } from 'axios';
import { getBasePath } from './utils';
import {
  Notification,
  DashboardStats,
  DashboardTrendsResponse,
  PaginatedResponse,
  NotificationFilters,
  Alert,
  PluginMetadata,
  NotificationTemplateListItem,
  NotificationTemplateDetail,
  NotificationTemplateCreatePayload,
  NotificationTemplateUpdatePayload,
  AdminChannel,
  AdminChannelFormData,
  AdminChannelProviderMeta,
  InstalledPlugin,
  PluginCatalogItem,
  NpmAuthStatus,
  InstallPluginPayload,
  ProviderDto,
  ChannelRoutingDto,
  OperationalSettings,
  AdminAuthStatus,
  ProviderRateLimitStatus,
  ProviderRateLimitListResponse,
} from './types';

export class ApiError extends Error {
  status?: number;
  details?: unknown;

  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export const apiClient = axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
});

// Dynamic Base URL Resolution
apiClient.interceptors.request.use((config) => {
  config.baseURL = getBasePath();
  return config;
});

// Response Interceptor for Centralized Error Handling
apiClient.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError) => {
    let message = 'An unexpected error occurred';
    let details: unknown = null;

    if (error.response) {
      // Backend core error formats: { error: 'msg' } or { message: 'msg' }
      const data = error.response.data as Record<string, unknown> | null | undefined;
      message = (data?.error as string) || (data?.message as string) || `Request failed with status ${error.response.status}`;
      details = data?.details || null;
    } else if (error.request) {
      message = 'No response received from server. Check your network connection.';
    } else {
      message = error.message;
    }

    return Promise.reject(new ApiError(message, error.response?.status, details));
  }
);

// Service Modules
export const authService = {
  login: (payload: Record<string, unknown>): Promise<{ success: boolean; redirectUrl: string }> => 
    apiClient.post('/api/auth/login', payload),
  logout: (): Promise<unknown> => apiClient.post('/api/auth/logout'),
  getSession: (): Promise<{ authenticated: boolean; user?: { id: string; username: string } }> => 
    apiClient.get('/api/auth/session'),
  getAuthStatus: (): Promise<AdminAuthStatus> =>
    apiClient.get('/api/auth/status'),
  setup: (payload: { username: string; password: string }): Promise<{ success: boolean; redirectUrl: string; message?: string }> =>
    apiClient.post('/api/auth/setup', payload),
};

export const settingsService = {
  get: (): Promise<{ success: boolean; settings: OperationalSettings }> =>
    apiClient.get('/api/settings'),
  update: (payload: Partial<OperationalSettings>): Promise<{ success: boolean; message: string; settings: OperationalSettings }> =>
    apiClient.put('/api/settings', payload),
  reset: (): Promise<{ success: boolean; message: string; settings: OperationalSettings }> =>
    apiClient.post('/api/settings/reset'),
};

export const notificationService = {
  list: (params: NotificationFilters): Promise<PaginatedResponse<Notification>> => 
    apiClient.get('/api/notifications', { params }),
  get: (id: string): Promise<Notification> => 
    apiClient.get(`/api/notifications/${id}`),
  retry: (id: string): Promise<{ success: boolean; message: string }> => 
    apiClient.post(`/api/notifications/${id}/retry`),
  send: (payload: Record<string, unknown>): Promise<unknown> => 
    apiClient.post('/api/notification', payload),
  sendBatch: (payload: Record<string, unknown>): Promise<unknown> => 
    apiClient.post('/api/notification/batch', payload),
  delete: (id: string): Promise<{ success: boolean }> => 
    apiClient.delete(`/api/notifications/${id}`),
};

export const templateService = {
  list: (packageName?: string): Promise<NotificationTemplateListItem[]> =>
    apiClient.get('/api/templates', {
      params: packageName ? { package_name: packageName } : {},
    }),
  get: (id: string): Promise<NotificationTemplateDetail> => 
    apiClient.get(`/api/templates/${encodeURIComponent(id)}`),
  create: (payload: NotificationTemplateCreatePayload): Promise<unknown> => 
    apiClient.post('/api/templates/create', payload),
  update: (id: string, payload: NotificationTemplateUpdatePayload): Promise<unknown> =>
    apiClient.put(`/api/templates/${encodeURIComponent(id)}`, payload),
  delete: (id: string): Promise<unknown> => 
    apiClient.delete(`/api/templates/${encodeURIComponent(id)}`),
};

export const alertService = {
  list: (page: number, limit: number, type?: string): Promise<{
    alerts: Alert[];
    count: number;
    byType: Record<string, number>;
    page: number;
    limit: number;
    totalPages: number;
  }> =>
    apiClient.get('/api/alerts', {
      params: { page, limit, type },
    }),
  resolve: (id: string, payload: { appendWarning?: boolean }): Promise<{ success: boolean }> =>
    apiClient.post(`/api/alerts/${id}/resolve`, payload),
  bulkResolve: (payload: { appendWarning?: boolean; limit?: number }): Promise<{ success: boolean; message: string }> =>
    apiClient.post('/api/alerts/bulk-resolve', payload),
  delete: (id: string): Promise<{ success: boolean }> => 
    apiClient.delete(`/api/alerts/${id}`),
};

export const pluginService = {
  listCatalog: (category: 'official' | 'community'): Promise<PluginCatalogItem[]> =>
    apiClient.get(`/api/plugins/catalog/${category}`),
  getMetadata: (): Promise<PluginMetadata> => apiClient.get('/api/plugins'),
  listInstalled: (): Promise<{ plugins: InstalledPlugin[] }> => apiClient.get('/api/plugins/installed'),
  install: (payload: string | InstallPluginPayload, version?: string): Promise<{ message: string; plugin: InstalledPlugin }> => {
    const body = typeof payload === 'string' ? { package: payload, version } : payload;
    return apiClient.post('/api/plugins/install', body);
  },
  changeVersion: (packageName: string, version: string): Promise<{ message: string; plugin: InstalledPlugin }> =>
    apiClient.put('/api/plugins/version', { package: packageName, version }),
  uninstall: (packageName: string): Promise<{ message: string }> =>
    apiClient.delete(`/api/plugins/${encodeURIComponent(packageName)}`),
  getNpmAuth: (): Promise<NpmAuthStatus> => apiClient.get('/api/plugins/npm-auth'),
  saveNpmAuth: (payload: { token: string; registry_url?: string; scope?: string }): Promise<{ message: string; status: NpmAuthStatus }> =>
    apiClient.post('/api/plugins/npm-auth', payload),
  deleteNpmAuth: (idOrScope?: string): Promise<{ message: string }> =>
    apiClient.delete('/api/plugins/npm-auth', { params: idOrScope ? { id: idOrScope } : undefined }),
};

export const providerService = {
  list: (): Promise<{ providers: ProviderDto[] }> => apiClient.get('/api/providers'),
  get: (id: string, includeDecrypted = false): Promise<{ provider: ProviderDto }> =>
    apiClient.get(`/api/providers/${id}`, { params: { include_decrypted: includeDecrypted } }),
  create: (payload: {
    id: string;
    plugin_name: string;
    credentials: Record<string, string>;
    options?: Record<string, unknown> & { priority?: number };
    enabled?: boolean;
  }): Promise<{ message: string; provider: ProviderDto }> =>
    apiClient.post('/api/providers', payload),
  update: (id: string, payload: {
    credentials?: Record<string, string>;
    options?: Record<string, unknown> & { priority?: number };
    enabled?: boolean;
  }): Promise<{ message: string; provider: ProviderDto }> =>
    apiClient.put(`/api/providers/${id}`, payload),
  delete: (id: string): Promise<{ message: string }> =>
    apiClient.delete(`/api/providers/${id}`),
  test: (payload: {
    provider_id?: string;
    plugin_name?: string;
    credentials?: Record<string, string>;
    options?: Record<string, unknown>;
  }): Promise<{ success: boolean; message: string }> =>
    apiClient.post('/api/providers/test', payload),
  getRateLimits: (): Promise<ProviderRateLimitListResponse> =>
    apiClient.get('/api/providers/rate-limits'),
  getRateLimit: (id: string): Promise<{ rate_limit: ProviderRateLimitStatus }> =>
    apiClient.get(`/api/providers/${id}/rate-limit`),
  resetRateLimit: (id: string): Promise<{ message: string }> =>
    apiClient.post(`/api/providers/${id}/rate-limit/reset`),
};

export const channelRoutingService = {
  list: (): Promise<{ routings: ChannelRoutingDto[] }> => apiClient.get('/api/channels/routing'),
  get: (channel: string): Promise<{ routing: ChannelRoutingDto }> => apiClient.get(`/api/channels/routing/${channel}`),
  set: (channel: string, payload: {
    default_provider_id: string;
    fallback_provider_ids?: string[];
    partitions?: number;
  }): Promise<{ message: string; routing: ChannelRoutingDto }> =>
    apiClient.put(`/api/channels/routing/${channel}`, payload),
  delete: (channel: string): Promise<{ message: string }> =>
    apiClient.delete(`/api/channels/routing/${channel}`),
};

export const adminChannelService = {
  list: (): Promise<{ channels: AdminChannel[] }> => apiClient.get('/api/admin-channels'),
  get: (id: string): Promise<AdminChannel> => apiClient.get(`/api/admin-channels/${id}`),
  create: (payload: AdminChannelFormData): Promise<{ success: boolean; channel: AdminChannel }> => 
    apiClient.post('/api/admin-channels', payload),
  update: (id: string, payload: Partial<AdminChannelFormData>): Promise<{ success: boolean; channel: AdminChannel }> => 
    apiClient.patch(`/api/admin-channels/${id}`, payload),
  delete: (id: string): Promise<{ success: boolean }> => 
    apiClient.delete(`/api/admin-channels/${id}`),
  getProviders: (): Promise<{ providers: AdminChannelProviderMeta[] }> => 
    apiClient.get('/api/admin-channels/providers'),
  test: (payload: { channel_type: string; config: Record<string, unknown> }): Promise<{ success: boolean; message?: string; error?: string }> => 
    apiClient.post('/api/admin-channels/test', payload),
};

export const dashboardService = {
  getStats: (): Promise<DashboardStats> => apiClient.get('/api/dashboard/stats'),
  getTrends: (period?: string): Promise<DashboardTrendsResponse> => 
    apiClient.get('/api/dashboard/trends', { params: { period } }),
};
