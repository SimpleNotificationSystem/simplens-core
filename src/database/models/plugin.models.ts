/**
 * Plugin Model
 * Stores installed notification plugins with metadata and package version
 */

import { type plugin_document, type provider_manifest } from '@src/types/types.js';
import mongoose from 'mongoose';

const manifestSubSchema = new mongoose.Schema<provider_manifest>(
  {
    name: { type: String, required: true },
    version: { type: String, required: true },
    channel: { type: String, required: true },
    displayName: { type: String, required: true },
    description: { type: String, required: true },
    author: { type: String },
    homepage: { type: String },
    requiredCredentials: [{ type: String, required: true }],
    optionalConfig: [{ type: String }],
  },
  { _id: false }
);

const plugin_schema = new mongoose.Schema<plugin_document>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    version: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['installed', 'installing', 'failed'],
      default: 'installed',
      index: true,
    },
    error: {
      type: String,
    },
    manifest: {
      type: manifestSubSchema,
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

const plugin_model =
  mongoose.models.Plugin || mongoose.model<plugin_document>('Plugin', plugin_schema);

export default plugin_model;
