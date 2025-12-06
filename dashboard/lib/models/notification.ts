/**
 * Notification model for the dashboard
 * Replicates the schema from the notification service
 */

import mongoose, { Schema, Document } from 'mongoose';
import { NOTIFICATION_STATUS, CHANNEL, type Notification } from '@/lib/types';

export interface NotificationDocument extends Omit<Notification, '_id'>, Document { }

const emailContentSchema = new Schema({
    subject: { type: String },
    message: { type: String, required: true }
}, { _id: false });

const whatsappContentSchema = new Schema({
    message: { type: String }
}, { _id: false });

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
            enum: Object.values(CHANNEL),
            required: true,
        },
        recipient: {
            user_id: {
                type: String,
                required: true,
            },
            email: {
                type: String,
            },
            phone: {
                type: String,
            },
        },
        content: {
            type: {
                email: { type: emailContentSchema },
                whatsapp: { type: whatsappContentSchema },
            },
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
