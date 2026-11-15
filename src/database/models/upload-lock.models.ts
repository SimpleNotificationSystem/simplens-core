/**
 * Upload Lock Model
 * Distributed lock for serializing concurrent file uploads by hash & filename
 */

import mongoose from 'mongoose';
import { type UploadLockDoc } from '@src/types/types.js';

const upload_lock_schema = new mongoose.Schema<UploadLockDoc>(
    {
        lock_key: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        locked_by: {
            type: String,
            required: true,
        },
        expires_at: {
            type: Date,
            required: true,
        },
    },
    {
        timestamps: {
            createdAt: 'created_at',
            updatedAt: false,
        },
    }
);

// TTL index to automatically purge expired locks
upload_lock_schema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

const upload_lock_model =
    mongoose.models.upload_lock ||
    mongoose.model<UploadLockDoc>('upload_lock', upload_lock_schema);

export default upload_lock_model;
