/**
 * Status Outbox Model
 * Minimal transactional outbox for publishing notification status updates to Kafka.
 * Used by the recovery service to ensure atomic status updates.
 */

import mongoose from 'mongoose';
import { NOTIFICATION_STATUS_SF, type status_outbox } from '@src/types/types.js';


const status_outbox_schema = new mongoose.Schema<status_outbox>(
    {
        notification_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Notification',
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: Object.values(NOTIFICATION_STATUS_SF),
            required: true,
        },
        provider: {
            type: String,
        },
        provider_history: [
            {
                provider: { type: String, required: true },
                status: { type: String, enum: ['delivered', 'failed', 'rate_limited'], required: true },
                error_code: { type: String },
                error_message: { type: String },
                retryable: { type: Boolean },
                attempted_at: { type: Date, default: Date.now },
                duration_ms: { type: Number },
                response: { type: mongoose.Schema.Types.Mixed },
            }
        ],
        processed: {
            type: Boolean,
            default: false,
            index: true,
        },
        claimed_by: {
            type: String,
            default: null,
            index: true,
        },
        claimed_at: {
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

// Index for efficient polling of unprocessed entries
status_outbox_schema.index({ processed: 1, created_at: 1 });
status_outbox_schema.index({ processed: 1, claimed_by: 1, created_at: 1 });
// Index for claiming stale entries
status_outbox_schema.index({ processed: 1, claimed_at: 1 });

const status_outbox_model = mongoose.model<status_outbox>('StatusOutbox', status_outbox_schema);

export default status_outbox_model;
