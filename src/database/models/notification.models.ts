import { NOTIFICATION_STATUS, type notification } from '@src/types/types.js';
import mongoose from 'mongoose';
import {validate, version} from 'uuid';
import { CHANNEL } from '@src/types/types.js';

const emailContentSchema = new mongoose.Schema({
  subject: { type: String },
  message: { type: String, required: true }
}, { _id: false });

const whatsappContentSchema = new mongoose.Schema({
  message: { type: String }
}, { _id: false });

const notification_schema = new mongoose.Schema<notification>(
  {
    request_id: {
      type: String,
      required: true,
      validate: {
        validator: (v: string)=> validate(v)&&version(v)==4,
        message: (props: {value: string})=>`${props.value} is not a valid UUIDV4 ID`
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
      enum: Object.values(CHANNEL),
      required: true,
    },
    recipient: {
      user_id: {
        type: String,
        required: true,
      },
      email: {
        type: String,
      },
      phone: {
        type: String,
      },
    },
   content: {
      type: {
        email: { type: emailContentSchema },      
        whatsapp: { type: whatsappContentSchema },
      },
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

notification_schema.index({ client_id: 1, status: 1 });

const notification_model = mongoose.model<notification>('Notification', notification_schema);

export default notification_model;