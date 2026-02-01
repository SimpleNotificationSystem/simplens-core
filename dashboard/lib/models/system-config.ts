/**
 * System Config model for dashboard
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface SystemConfigDocument extends Document {
    key: string;
    value: string;
    created_at: Date;
    updated_at: Date;
}

const systemConfigSchema = new Schema<SystemConfigDocument>(
    {
        key: { type: String, required: true, unique: true },
        value: { type: String, required: true },
    },
    {
        timestamps: {
            createdAt: 'created_at',
            updatedAt: 'updated_at',
        },
    }
);

export const SystemConfigModel =
    mongoose.models.SystemConfig ||
    mongoose.model<SystemConfigDocument>('SystemConfig', systemConfigSchema);
