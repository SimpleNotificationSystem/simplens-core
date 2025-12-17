/**
 * Alert Model for Dashboard
 * Used to display alerts for notifications requiring manual inspection.
 */

import mongoose from "mongoose";

const alertSchema = new mongoose.Schema(
    {
        notification_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Notification",
            required: true,
            index: true,
        },
        alert_type: {
            type: String,
            enum: ["ghost_delivery", "stuck_processing", "orphaned_pending"],
            required: true,
            index: true,
        },
        reason: {
            type: String,
            required: true,
        },
        redis_status: {
            type: String,
            default: null,
        },
        db_status: {
            type: String,
            enum: ["pending", "processing", "delivered", "failed"],
            required: true,
        },
        retry_count: {
            type: Number,
            default: 0,
        },
        resolved: {
            type: Boolean,
            default: false,
            index: true,
        },
        resolved_at: {
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

alertSchema.index({ notification_id: 1, alert_type: 1 }, { unique: true });
alertSchema.index({ resolved: 1, created_at: -1 });

const AlertModel =
    mongoose.models?.Alert || mongoose.model("Alert", alertSchema);

export default AlertModel;
