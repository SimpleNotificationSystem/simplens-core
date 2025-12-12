/**
 * Alert Model - Tracks system-level issues detected by the recovery cron
 * 
 * These are NOT failed notifications - they are observations that need human review:
 * - stuck_processing: Notification stuck in processing longer than expected
 * - ghost_delivery: Notification was delivered but status update failed
 * - orphaned_pending: Notification stuck in pending (outbox issue)
 */

import mongoose from 'mongoose';
import { ALERT_TYPE, ALERT_SEVERITY, type alert } from '@src/types/types.js';

const alertSchema = new mongoose.Schema<alert>(
    {
        type: {
            type: String,
            enum: Object.values(ALERT_TYPE),
            required: true,
            index: true
        },
        notification_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Notification',
            index: true
        },
        message: {
            type: String,
            required: true
        },
        severity: {
            type: String,
            enum: Object.values(ALERT_SEVERITY),
            default: ALERT_SEVERITY.warning
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed
        },
        resolved: {
            type: Boolean,
            default: false,
            index: true
        },
        resolved_at: {
            type: Date
        },
        resolved_by: {
            type: String
        }
    },
    {
        timestamps: {
            createdAt: 'created_at',
            updatedAt: 'updated_at'
        }
    }
);

// Index for finding unresolved alerts quickly
alertSchema.index({ resolved: 1, created_at: -1 });

// Index for finding alerts by notification
alertSchema.index({ notification_id: 1, type: 1 });

const alert_model = mongoose.model<alert>('Alert', alertSchema);

export default alert_model;
