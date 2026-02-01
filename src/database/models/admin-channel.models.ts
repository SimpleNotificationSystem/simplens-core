/**
 * Admin Notification Channel Model
 * Stores admin alert channel configurations with encrypted credentials
 * Uses zod-inferred types from types.ts
 */

import {
    type admin_channel,
    type encrypted_config,
} from '@src/types/types.js';
import { ADMIN_CHANNEL_TYPE } from '@src/types/schemas.js';
import mongoose from 'mongoose';

// Subdocument schema for encrypted config - matches encrypted_config type
const encryptedConfigSubSchema = new mongoose.Schema<encrypted_config>(
    {
        encrypted_data: { type: String, required: true },
        iv: { type: String, required: true },
        auth_tag: { type: String, required: true },
    },
    { _id: false }
);

const admin_channel_schema = new mongoose.Schema<admin_channel>(
    {
        channel_type: {
            type: String,
            enum: ADMIN_CHANNEL_TYPE,
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            maxlength: 100,
        },
        enabled: {
            type: Boolean,
            default: true,
            index: true,
        },
        config: {
            type: encryptedConfigSubSchema,
            required: true,
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

const admin_channel_model = mongoose.model<admin_channel>(
    'AdminNotificationChannel',
    admin_channel_schema
);

export default admin_channel_model;
