/**
 * Notification Model
 * 
 * Stores notification records in MongoDB.
 * Channel-agnostic - supports any channel via flexible schema.
 */

import { NOTIFICATION_STATUS, type notification } from '@src/types/types.js';
import mongoose from 'mongoose';
import { validate, version } from 'uuid';

const notification_schema = new mongoose.Schema<notification>(
  {
    request_id: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => validate(v) && version(v) == 4,
        message: (props: { value: string }) => `${props.value} is not a valid UUIDV4 ID`
      }
    },
    client_id: {
      type: String,
      required: true,
      index: true,
      validate: {
        validator: (v: string) => validate(v) && version(v) === 4,
        message: (props: { value: string }) => `${props.value} is not a valid UUID v4`,
      }
    },
    client_name: {
      type: String,
    },
    channel: {
      type: String,
      required: true,
      index: true,
    },
    provider: {
      type: String,
      index: true,
    },
    // Dynamic recipient schema - structure depends on channel
    recipient: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    // Dynamic content schema - structure depends on channel
    content: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    variables: {
      type: Map,
      of: String,
    },
    webhook_url: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(NOTIFICATION_STATUS),
      default: NOTIFICATION_STATUS.pending,
      index: true,
    },
    scheduled_at: {
      type: Date,
    },
    error_message: {
      type: String,
    },
    retry_count: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

// Unique constraint: one notification per request_id + channel
notification_schema.index(
  { request_id: 1, channel: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: {
        $in: [
          NOTIFICATION_STATUS.pending,
          NOTIFICATION_STATUS.processing,
          NOTIFICATION_STATUS.delivered
        ]
      }
    }
  }
);

const notification_model = mongoose.model<notification>('Notification', notification_schema);

export default notification_model;