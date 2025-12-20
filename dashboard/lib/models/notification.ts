/**
 * Notification model for the dashboard
 * Channel-agnostic - supports any channel registered via plugins
 */

import mongoose, { Schema, Document } from 'mongoose';
import { NOTIFICATION_STATUS, type Notification } from '@/lib/types';

export interface NotificationDocument extends Omit<Notification, '_id'>, Document { }

const notificationSchema = new Schema<NotificationDocument>(
    {
        request_id: {
            type: String,
            required: true,
        },
        client_id: {
            type: String,
            required: true,
            index: true,
        },
        client_name: {
            type: String,
        },
        channel: {
            type: String,
            required: true,
            index: true,
        },
        // Dynamic recipient - structure depends on channel
        recipient: {
            type: Schema.Types.Mixed,
            required: true,
        },
        // Dynamic content - structure depends on channel  
        content: {
            type: Schema.Types.Mixed,
            required: true,
        },
        variables: {
            type: Map,
            of: String,
        },
        webhook_url: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: Object.values(NOTIFICATION_STATUS),
            default: NOTIFICATION_STATUS.pending,
            index: true,
        },
        scheduled_at: {
            type: Date,
        },
        error_message: {
            type: String,
        },
        retry_count: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: {
            createdAt: 'created_at',
            updatedAt: 'updated_at',
        },
    }
);

// Prevent model overwrite error in development
export const NotificationModel =
    mongoose.models.Notification ||
    mongoose.model<NotificationDocument>('Notification', notificationSchema);
