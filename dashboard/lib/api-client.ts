/**
 * Dashboard API Client
 * Centralized client-side fetch wrapper using Axios
 */
import axios, { AxiosError } from 'axios';
import { getBasePath } from './utils';
import {
  Notification,
  DashboardStats,
  TrendDataPoint,
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
  get: (id: string): Promise<Alert> => 
    apiClient.get(`/api/alerts/${id}`),
  resolve: (id: string, payload: { appendWarning?: boolean }): Promise<{ success: boolean }> =>
    apiClient.post(`/api/alerts/${id}/resolve`, payload),
  bulkResolve: (payload: { appendWarning?: boolean; limit?: number }): Promise<{ success: boolean; message: string }> =>
    apiClient.post('/api/alerts/bulk-resolve', payload),
  delete: (id: string): Promise<{ success: boolean }> => 
    apiClient.delete(`/api/alerts/${id}`),
};

export const pluginService = {
  getMetadata: (): Promise<PluginMetadata> => apiClient.get('/api/plugins'),
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
  getTrends: (hours?: number): Promise<TrendDataPoint[]> => 
    apiClient.get('/api/dashboard/trends', { params: { hours } }),
};
