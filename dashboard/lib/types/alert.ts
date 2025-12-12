/**
 * Alert types for Dashboard components
 * These are client-side safe types (no mongoose dependency)
 */

export enum ALERT_TYPE {
    stuck_processing = 'stuck_processing',
    ghost_delivery = 'ghost_delivery',
    orphaned_pending = 'orphaned_pending',
    recovery_error = 'recovery_error'
}

export enum ALERT_SEVERITY {
    warning = 'warning',
    error = 'error',
    critical = 'critical'
}

export interface AlertResponse {
    _id: string;
    type: ALERT_TYPE;
    notification_id?: string;
    message: string;
    severity: ALERT_SEVERITY;
    metadata?: Record<string, unknown>;
    resolved: boolean;
    resolved_at?: Date;
    resolved_by?: string;
    created_at: Date;
    updated_at: Date;
}
