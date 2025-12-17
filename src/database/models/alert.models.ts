import { ALERT_TYPE, NOTIFICATION_STATUS, type alert } from '@src/types/types.js';
import mongoose from 'mongoose';

const alert_schema = new mongoose.Schema<alert>(
    {
        notification_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Notification',
            required: true,
            index: true,
        },
        alert_type: {
            type: String,
            enum: Object.values(ALERT_TYPE),
            required: true,
            index: true,
        },
        reason: {
            type: String,
            required: true,
        },
        redis_status: {
            type: String,
            default: null,
        },
        db_status: {
            type: String,
            enum: Object.values(NOTIFICATION_STATUS),
            required: true,
        },
        retry_count: {
            type: Number,
            default: 0,
        },
        resolved: {
            type: Boolean,
            default: false,
            index: true,
        },
        resolved_at: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: {
            createdAt: 'created_at',
            updatedAt: 'updated_at',
        },
    }
);

// Compound unique index to prevent duplicate alerts for same notification and type
alert_schema.index({ notification_id: 1, alert_type: 1 }, { unique: true });

// Index for querying unresolved alerts
alert_schema.index({ resolved: 1, created_at: -1 });

const alert_model = mongoose.model<alert>('Alert', alert_schema);

export default alert_model;
