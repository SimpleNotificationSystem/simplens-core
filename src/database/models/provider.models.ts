/**
 * Provider Model
 * Stores configured provider instances with encrypted credentials
 */

import {
  type provider_document,
  type encrypted_credentials,
} from '@src/types/types.js';
import mongoose from 'mongoose';

// Subdocument schema for key-pair envelope encrypted credentials
const encryptedCredentialsSubSchema = new mongoose.Schema<encrypted_credentials>(
  {
    encrypted_data: { type: String, required: true },
    iv: { type: String, required: true },
    auth_tag: { type: String, required: true },
    encrypted_dek: { type: String, required: true },
  },
  { _id: false }
);

const provider_schema = new mongoose.Schema<provider_document>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    plugin_name: {
      type: String,
      required: true,
      index: true,
    },
    channel: {
      type: String,
      required: true,
      index: true,
    },
    priority: {
      type: Number,
      default: 0,
      index: true,
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    credentials: {
      type: encryptedCredentialsSubSchema,
      required: true,
    },
    options: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

// Compound index for priority-based provider routing per channel
provider_schema.index({ channel: 1, priority: -1 });

const provider_model =
  mongoose.models.Provider || mongoose.model<provider_document>('Provider', provider_schema);

export default provider_model;
