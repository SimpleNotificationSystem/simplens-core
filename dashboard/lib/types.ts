/**
 * Types for the admin dashboard
 * Channel-agnostic - supports any channel registered via plugins
 */

// Channel is a dynamic string, not an enum
export type Channel = string;

export enum NOTIFICATION_STATUS {
  delivered = "delivered",
  pending = "pending",
  processing = "processing",
  failed = "failed",
}

// Generic recipient - structure depends on channel
export interface Recipient {
  user_id: string;
  [key: string]: unknown;
}

// Generic content - structure depends on channel
export type NotificationContent = Record<string, unknown>;

export interface ProviderAttempt {
  provider: string;
  status: 'delivered' | 'failed' | 'rate_limited';
  error_code?: string;
  error_message?: string;
  retryable?: boolean;
  attempted_at: Date | string;
  duration_ms?: number;
  response?: unknown;
}

export interface Notification {
  _id: string;
  request_id: string;
  client_id: string;
  client_name?: string;
  channel: Channel;
  provider?: string; // Provider ID used for this notification
  provider_history?: ProviderAttempt[];
  recipient: Recipient;
  content: NotificationContent;
  variables?: Record<string, string>;
  webhook_url: string;
  status: NOTIFICATION_STATUS;
  scheduled_at?: Date;
  error_message?: string;
  retry_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface DashboardStats {
  total: number;
  pending: number;
  processing: number;
  delivered: number;
  failed: number;
  byChannel: Record<string, number>;
}

export interface TrendDataPoint {
  time: number;
  status: NOTIFICATION_STATUS;
  count: number;
}

export interface DashboardTrendsResponse {
  period: string;
  startDate: string;
  data: TrendDataPoint[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export interface NotificationFilters {
  status?: NOTIFICATION_STATUS;
  channel?: Channel;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export enum ALERT_TYPE {
  ghost_delivery = "ghost_delivery",
  stuck_processing = "stuck_processing",
  orphaned_pending = "orphaned_pending",
}

export interface Alert {
  _id: string;
  notification_id: string;
  alert_type: ALERT_TYPE;
  reason: string;
  redis_status: string | null;
  db_status: NOTIFICATION_STATUS;
  retry_count: number;
  resolved: boolean;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface FieldDefinition {
  name: string;
  type: "string" | "email" | "phone" | "text" | "number" | "boolean";
  required: boolean;
  description?: string;
}

export interface ProviderMetadata {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  priority: number;
  recipientFields: FieldDefinition[];
  contentFields: FieldDefinition[];
}

export interface ChannelMetadata {
  providers: ProviderMetadata[];
  default?: string;
  fallback?: string;
}

export interface PluginMetadata {
  channels: Record<string, ChannelMetadata>;
}

export interface NotificationTemplateListItem {
  name: string;
  description?: string;
  template_id: string;
  package: string;
  created_at?: string;
}

export interface NotificationTemplateDetail extends NotificationTemplateListItem {
  content: Record<string, unknown>;
}

export interface NotificationTemplateCreatePayload {
  name: string;
  template_id?: string;
  description?: string;
  package: string;
  content: Record<string, unknown>;
}

export interface NotificationTemplateUpdatePayload {
  name: string;
  description: string;
  package: string;
  content: Record<string, unknown>;
}

// ============================================================================
// ADMIN NOTIFICATION CHANNEL TYPES
// ============================================================================

export const ADMIN_CHANNEL_TYPE = [
  "discord",
  "telegram",
  "email",
  "slack",
] as const;
export type AdminChannelType = (typeof ADMIN_CHANNEL_TYPE)[number];

export const ADMIN_ALERT_TYPE = [
  "failed_notification",
  "service_health",
  "stuck_processing",
  "orphaned_pending",
  "ghost_delivery",
] as const;
export type AdminAlertType = (typeof ADMIN_ALERT_TYPE)[number];

export interface AlertFilters {
  failed_notifications: boolean;
  service_health: boolean;
  stuck_processing: boolean;
  orphaned_pending: boolean;
  ghost_delivery: boolean;
}

export interface AdminChannel {
  _id: string;
  channel_type: AdminChannelType;
  name: string;
  enabled: boolean;
  alert_filters: AlertFilters;
  created_at: Date;
  updated_at: Date;
}

export interface AdminChannelFormData {
  channel_type: AdminChannelType;
  name: string;
  config: Record<string, string>;
  alert_filters: AlertFilters;
  enabled?: boolean;
}

export interface AdminChannelProviderField {
  name: string;
  type: 'string' | 'url' | 'secret';
  label: string;
  placeholder?: string;
  description?: string;
  required: boolean;
  pattern?: string;
}

export interface AdminChannelProviderMeta {
  channelType: string;
  displayName: string;
  credentialFields: AdminChannelProviderField[];
}

// ============================================================================
// DYNAMIC PLUGIN & PROVIDER MANAGEMENT TYPES
// ============================================================================

export interface ProviderManifest {
  name: string;
  displayName: string;
  version: string;
  channel: string;
  description: string;
  author?: string;
  homepage?: string;
  requiredCredentials: string[];
  optionalConfig?: string[];
}

export interface InstalledPlugin {
  _id?: string;
  name: string;
  version: string;
  status: 'installed' | 'installing' | 'failed';
  error?: string;
  manifest: ProviderManifest;
  created_at?: string;
  updated_at?: string;
}

export interface PluginCatalogItem {
  name: string;
  package: string;
  description: string;
  versions?: string[];
}

export interface NpmRegistryStatus {
  id: string;
  scope?: string;
  registry_url: string;
  masked_token: string;
  updated_at: string;
}

export interface NpmAuthStatus {
  is_configured: boolean;
  registries?: NpmRegistryStatus[];
  default_registry?: string;
  masked_token?: string;
}

export interface InstallPluginPayload {
  package: string;
  version?: string;
  auth?: {
    token?: string;
    registry_url?: string;
    scope?: string;
    save_token?: boolean;
  };
}

export interface ProviderDto {
  _id?: string;
  id: string;
  plugin_name: string;
  channel: string;
  enabled: boolean;
  options?: {
    priority?: number;
    rateLimit?: {
      maxTokens?: number;
      refillRate?: number;
      refillInterval?: "second" | "minute" | "hour" | "day";
    };
    [key: string]: unknown;
  };
  credentials_configured: boolean;
  decrypted_credentials?: Record<string, string>;
  created_at?: string;
  updated_at?: string;
}

export interface ChannelRoutingDto {
  _id?: string;
  channel: string;
  default_provider_id: string;
  fallback_provider_ids: string[];
  partitions: number;
  created_at?: string;
  updated_at?: string;
}

export interface OperationalSettings {
  api: {
    max_batch_req_limit: number;
  };
  worker: {
    outbox_poll_interval_ms: number;
    outbox_cleanup_interval_ms: number;
    outbox_batch_size: number;
    outbox_retention_ms: number;
    outbox_claim_timeout_ms: number;
  };
  retry: {
    max_retry_count: number;
    idempotency_ttl_seconds: number;
    processing_ttl_seconds: number;
    rate_limit_retry_delay_ms: number;
  };
  delayed: {
    delayed_poll_interval_ms: number;
    delayed_batch_size: number;
    max_poller_retries: number;
  };
  recovery: {
    recovery_poll_interval_ms: number;
    processing_stuck_threshold_ms: number;
    pending_stuck_threshold_ms: number;
    recovery_batch_size: number;
    recovery_claim_timeout_ms: number;
    cleanup_resolved_alerts_retention_ms: number;
    cleanup_processed_status_outbox_retention_ms: number;
  };
  logging: {
    log_level: 'debug' | 'info' | 'warn' | 'error';
    log_to_file: boolean;
  };
}

export interface AdminAuthStatus {
  isConfigured: boolean;
}

export interface ProviderRateLimitConfigDetails {
  max_tokens: number;
  refill_rate: number;
  refill_interval: "second" | "minute" | "hour" | "day";
  normalized_refill_rate: number;
}

export interface ProviderRateLimitRealtimeStatus {
  remaining_tokens: number;
  used_tokens: number;
  usage_percentage: number;
  is_exhausted: boolean;
  resets_in_ms: number;
  full_refill_in_ms: number;
  last_refill_at: string | null;
  last_exhausted_at: string | null;
  exhausted_count: number;
}

export interface ProviderRateLimitStatus {
  provider_id: string;
  channel: string;
  plugin_name: string;
  display_name?: string;
  enabled: boolean;
  config: ProviderRateLimitConfigDetails;
  status: ProviderRateLimitRealtimeStatus;
}

export interface ProviderRateLimitSummary {
  total_providers: number;
  exhausted_providers: number;
  healthy_providers: number;
}

export interface ProviderRateLimitListResponse {
  providers: ProviderRateLimitStatus[];
  summary: ProviderRateLimitSummary;
}

// ============================================================================
// API KEY MANAGEMENT TYPES
// ============================================================================

export interface ApiKeyUsage {
  total_requests: number;
  total_notifications: number;
  by_channel: Record<string, number>;
  last_used_at?: string | null;
}

export interface ApiKey {
  key_id: string;
  name: string;
  key_prefix: string;
  status: 'active' | 'revoked';
  expires_at?: string | null;
  usage: ApiKeyUsage;
  created_at: string;
}

export interface CreateApiKeyPayload {
  name: string;
  expires_at?: string;
}

export interface CreateApiKeyResponse {
  key: ApiKey;
  raw_key: string;
}

export interface ApiKeyUsageDetailResponse {
  key: ApiKey;
  status_breakdown: {
    pending: number;
    processing: number;
    delivered: number;
    failed: number;
  };
}


