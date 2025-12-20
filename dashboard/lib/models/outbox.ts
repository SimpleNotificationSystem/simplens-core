/**
 * Outbox Model for Dashboard
 * Channel-agnostic - topic is a dynamic string
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
            required: true,
            index: true,
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
