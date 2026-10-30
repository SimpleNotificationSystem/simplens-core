/**
 * Storage Provider Model
 * Stores storage provider configurations with encrypted credentials
 */

import {
    type StorageProviderDoc,
    type encrypted_config,
} from '@src/types/types.js';
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

const storage_provider_schema = new mongoose.Schema<StorageProviderDoc>(
    {
        name: {
            type: String,
            required: true,
            maxlength: 100,
        },
        provider_type: {
            type: String,
            required: true,
            index: true,
        },
        enabled: {
            type: Boolean,
            default: true,
            index: true,
        },
        is_active: {
            type: Boolean,
            default: false,
            index: true,
        },
        config: {
            type: encryptedConfigSubSchema,
            required: true,
        },
    },
    {
        timestamps: {
            createdAt: 'created_at',
            updatedAt: 'updated_at',
        },
    }
);

storage_provider_schema.index({ provider_type: 1, name: 1 }, { unique: true });

const storage_provider_model =
    mongoose.models.storage_provider ||
    mongoose.model<StorageProviderDoc>('storage_provider', storage_provider_schema);

export default storage_provider_model;
