/**
 * Alert Model for Dashboard API routes
 * Server-side only - uses mongoose
 */

import mongoose from 'mongoose';
import { ALERT_TYPE, ALERT_SEVERITY } from '@/lib/types/alert';

const alertSchema = new mongoose.Schema(
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

// Use existing model if it exists, otherwise create new one
export const AlertModel = mongoose.models.Alert || mongoose.model('Alert', alertSchema);
