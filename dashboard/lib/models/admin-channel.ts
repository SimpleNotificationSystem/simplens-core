/**
 * Admin Notification Channel model for dashboard
 */

import mongoose, { Schema, Document } from 'mongoose';
import { ADMIN_CHANNEL_TYPE } from '@/lib/types';

export interface AdminChannelDocument extends Document {
    channel_type: string;
    name: string;
    enabled: boolean;
    config: {
        encrypted_data: string;
        iv: string;
        auth_tag: string;
    };
    alert_filters: {
        failed_notifications: boolean;
        service_health: boolean;
        stuck_processing: boolean;
        orphaned_pending: boolean;
        ghost_delivery: boolean;
    };
    created_at: Date;
    updated_at: Date;
}

const adminChannelSchema = new Schema<AdminChannelDocument>(
    {
        channel_type: {
            type: String,
            enum: ADMIN_CHANNEL_TYPE,
            required: true,
        },
        name: {
            type: String,
            required: true,
            maxlength: 100,
        },
        enabled: {
            type: Boolean,
            default: true,
        },
        config: {
            encrypted_data: { type: String, required: true },
            iv: { type: String, required: true },
            auth_tag: { type: String, required: true },
        },
        alert_filters: {
            failed_notifications: { type: Boolean, default: true },
            service_health: { type: Boolean, default: true },
            stuck_processing: { type: Boolean, default: true },
            orphaned_pending: { type: Boolean, default: true },
            ghost_delivery: { type: Boolean, default: false },
        },
    },
    {
        timestamps: {
            createdAt: 'created_at',
            updatedAt: 'updated_at',
        },
    }
);

export const AdminChannelModel =
    mongoose.models.AdminNotificationChannel ||
    mongoose.model<AdminChannelDocument>('AdminNotificationChannel', adminChannelSchema);
