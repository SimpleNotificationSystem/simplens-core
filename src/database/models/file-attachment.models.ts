/**
 * File Attachment Model
 * Stores metadata and file hash for uploaded notification attachments
 */

import { type FileAttachmentDoc } from '@src/types/types.js';
import mongoose from 'mongoose';

const file_attachment_schema = new mongoose.Schema<FileAttachmentDoc>(
    {
        file_id: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        filename: {
            type: String,
            required: true,
            maxlength: 255,
        },
        mime_type: {
            type: String,
            required: true,
            maxlength: 100,
        },
        size: {
            type: Number,
            required: true,
            min: 0,
        },
        hash: {
            type: String,
            required: true,
            index: true,
        },
        storage_provider: {
            type: String,
            required: false,
            index: true,
        },
        storage_key: {
            type: String,
            required: false,
        },
        url: {
            type: String,
            required: false,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            required: false,
        },
    },
    {
        timestamps: {
            createdAt: 'created_at',
            updatedAt: 'updated_at',
        },
    }
);

const file_attachment_model =
    mongoose.models.file_attachment ||
    mongoose.model<FileAttachmentDoc>('file_attachment', file_attachment_schema);

export default file_attachment_model;
