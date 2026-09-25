/**
 * API Key Model
 * 
 * Stores hashed API keys and real-time usage metrics for external service authentication.
 */

import { type ApiKeyDoc } from '@src/types/types.js';
import mongoose from 'mongoose';

const api_key_schema = new mongoose.Schema<ApiKeyDoc>(
    {
        key_id: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
        },
        key_prefix: {
            type: String,
            required: true,
        },
        key_hash: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        status: {
            type: String,
            enum: ['active', 'revoked'],
            default: 'active',
            index: true,
        },
        expires_at: {
            type: Date,
            default: null,
        },
        usage: {
            total_requests: {
                type: Number,
                default: 0,
            },
            total_notifications: {
                type: Number,
                default: 0,
            },
            by_channel: {
                type: Map,
                of: Number,
                default: {},
            },
            last_used_at: {
                type: Date,
                default: null,
            },
        },
    },
    {
        timestamps: {
            createdAt: 'created_at',
            updatedAt: 'updated_at',
        },
    }
);

const api_key_model =
    mongoose.models?.ApiKey ||
    mongoose.model<ApiKeyDoc>('ApiKey', api_key_schema);

export default api_key_model;
