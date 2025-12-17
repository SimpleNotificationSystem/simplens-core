/**
 * Types for the admin dashboard
 * Mirrors the notification service types
 */

export enum CHANNEL {
    email = "email",
    whatsapp = "whatsapp"
}

export enum NOTIFICATION_STATUS {
    delivered = "delivered",
    pending = "pending",
    processing = "processing",
    failed = "failed"
}

export interface Recipient {
    user_id: string;
    email?: string;
    phone?: string;
}

export interface EmailContent {
    subject?: string;
    message: string;
}

export interface WhatsappContent {
    message: string;
}

export interface NotificationContent {
    email?: EmailContent;
    whatsapp?: WhatsappContent;
}

export interface Notification {
    _id: string;
    request_id: string;
    client_id: string;
    client_name?: string;
    channel: CHANNEL;
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
    byChannel: {
        email: number;
        whatsapp: number;
    };
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
    channel?: CHANNEL;
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
}

export enum ALERT_TYPE {
    ghost_delivery = "ghost_delivery",
    stuck_processing = "stuck_processing",
    orphaned_pending = "orphaned_pending"
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
