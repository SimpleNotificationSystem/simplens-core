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

export interface Notification {
  _id: string;
  request_id: string;
  client_id: string;
  client_name?: string;
  channel: Channel;
  provider?: string; // Provider ID used for this notification
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
  timestamp: string;
  hour: number;
  count: number;
  status: NOTIFICATION_STATUS;
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
  template_id: string;
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
  webhook_url: string;
  alert_filters: AlertFilters;
}
