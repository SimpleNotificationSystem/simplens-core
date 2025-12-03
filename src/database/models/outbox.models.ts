import mongoose from 'mongoose';
import { 
  TOPICS, 
  OUTBOX_STATUS,
  type outbox
} from '@src/types/types.js';

const outbox_schema = new mongoose.Schema<outbox>({
    notification_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Notification',
        index: true
    },
    topic: {
      type: String,
      enum: Object.values(TOPICS).filter((topics: string)=>{return topics != TOPICS.notification_status}),
      required: true,
      index: true,
    },
    payload: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    status: {
      type: String,
      enum: Object.values(OUTBOX_STATUS),
      default: OUTBOX_STATUS.pending,
      index: true,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
});

outbox_schema.index({ status: 1, created_at: 1 });
outbox_schema.index({ topic: 1, status: 1 });

const outbox_model = mongoose.model<outbox>('Outbox', outbox_schema);

export default outbox_model;