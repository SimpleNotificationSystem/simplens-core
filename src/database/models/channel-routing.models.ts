/**
 * Channel Routing Model
 * Stores default and cascading fallback provider chains, plus Kafka partition targets
 */

import { type channel_routing_document } from '@src/types/types.js';
import mongoose from 'mongoose';

const channel_routing_schema = new mongoose.Schema<channel_routing_document>(
  {
    channel: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    default_provider_id: {
      type: String,
      required: true,
    },
    fallback_provider_ids: {
      type: [String],
      default: [],
    },
    partitions: {
      type: Number,
      default: 6,
      min: 1,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

const channel_routing_model =
  mongoose.models.ChannelRouting || mongoose.model<channel_routing_document>(
    'ChannelRouting',
    channel_routing_schema
  );

export default channel_routing_model;
