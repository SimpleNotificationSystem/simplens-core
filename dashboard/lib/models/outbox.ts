/**
 * Outbox Model for Dashboard
 * Used for creating outbox entries when retrying notifications.
 */

import mongoose from "mongoose";

const outboxSchema = new mongoose.Schema(
    {
        notification_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Notification",
            required: true,
            index: true,
        },
        topic: {
            type: String,
            enum: ["email_notification", "whatsapp_notification", "delayed_notification"],
            required: true,
        },
        payload: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
        },
        status: {
            type: String,
            enum: ["pending", "processing", "published"],
            default: "pending",
            index: true,
        },
        claimed_by: {
            type: String,
            default: null,
        },
        claimed_at: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: {
            createdAt: "created_at",
            updatedAt: "updated_at",
        },
    }
);

const OutboxModel =
    mongoose.models?.Outbox || mongoose.model("Outbox", outboxSchema);

export default OutboxModel;
