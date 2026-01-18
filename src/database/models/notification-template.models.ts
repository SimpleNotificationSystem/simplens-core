import { type notification_template } from "@src/types/types.js";
import mongoose from "mongoose";

const notification_template_schema = new mongoose.Schema<notification_template>(
    {
        name: {
            type: String,
            required: true,
        },
        template_id: {
            type: String,
            required: true,
            unique: true
        },
        description: {
            type: String
        },
        content: {
            type: mongoose.Schema.Types.Mixed,
            required: true
        },
        package: {
            type: String,
            required: true,
        }
    },
    {
        timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        }
    }
);

const notification_template_model = mongoose.model<notification_template>('Notification_Template', notification_template_schema);

export default notification_template_model;