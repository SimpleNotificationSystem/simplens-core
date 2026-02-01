/**
 * System Config Model
 * Stores system-wide configuration like auto-generated encryption keys
 */

import { type system_config } from '@src/types/types.js';
import mongoose from 'mongoose';

const system_config_schema = new mongoose.Schema<system_config>(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        value: {
            type: String,
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

const system_config_model = mongoose.model<system_config>('SystemConfig', system_config_schema);

export default system_config_model;
