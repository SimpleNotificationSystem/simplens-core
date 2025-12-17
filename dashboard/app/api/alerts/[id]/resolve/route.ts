/**
 * API Route: POST /api/alerts/[id]/resolve
 * Resolves an alert and optionally retries the notification with a warning message
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import AlertModel from "@/lib/models/alert";
import { NotificationModel } from "@/lib/models/notification";
import OutboxModel from "@/lib/models/outbox";
import { CHANNEL } from "@/lib/types";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        await connectDB();

        // Parse request body
        const body = await request.json();
        const { appendWarning } = body;

        // Validate alert ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json(
                { error: "Invalid alert ID" },
                { status: 400 }
            );
        }

        // Find the alert
        const alert = await AlertModel.findById(id);
        if (!alert) {
            return NextResponse.json(
                { error: "Alert not found" },
                { status: 404 }
            );
        }

        if (alert.resolved) {
            return NextResponse.json(
                { error: "Alert already resolved" },
                { status: 400 }
            );
        }

        // Find the notification
        const notification = await NotificationModel.findById(alert.notification_id);
        if (!notification) {
            return NextResponse.json(
                { error: "Notification not found" },
                { status: 404 }
            );
        }

        const session = await mongoose.startSession();

        try {
            await session.withTransaction(async () => {
                // Update notification content with warning if requested
                if (appendWarning) {
                    const isEmail = notification.channel === CHANNEL.email;
                    const warningMessage = isEmail
                        ? "\n\n⚠️ Ignore this email if you already received it!"
                        : "\n\n⚠️ Ignore this message if you already received it!";

                    if (isEmail && notification.content?.email?.message) {
                        notification.content.email.message += warningMessage;
                    } else if (!isEmail && notification.content?.whatsapp?.message) {
                        notification.content.whatsapp.message += warningMessage;
                    }
                }

                // Reset notification to pending status
                notification.status = "pending";
                notification.error_message = undefined;
                notification.updated_at = new Date();
                await notification.save({ session });

                // Create outbox entry for re-processing
                const topic = notification.channel === CHANNEL.email
                    ? "email_notification"
                    : "whatsapp_notification";

                const payload = notification.channel === CHANNEL.email
                    ? {
                        notification_id: notification._id,
                        request_id: notification.request_id,
                        client_id: notification.client_id,
                        channel: notification.channel,
                        recipient: {
                            user_id: notification.recipient.user_id,
                            email: notification.recipient.email,
                        },
                        content: {
                            subject: notification.content.email?.subject,
                            message: notification.content.email?.message || "",
                        },
                        variables: notification.variables,
                        webhook_url: notification.webhook_url,
                        retry_count: notification.retry_count,
                        created_at: new Date(),
                    }
                    : {
                        notification_id: notification._id,
                        request_id: notification.request_id,
                        client_id: notification.client_id,
                        channel: notification.channel,
                        recipient: {
                            user_id: notification.recipient.user_id,
                            phone: notification.recipient.phone,
                        },
                        content: {
                            message: notification.content.whatsapp?.message || "",
                        },
                        variables: notification.variables,
                        webhook_url: notification.webhook_url,
                        retry_count: notification.retry_count,
                        created_at: new Date(),
                    };

                await OutboxModel.create(
                    [
                        {
                            notification_id: notification._id,
                            topic,
                            payload,
                            status: "pending",
                        },
                    ],
                    { session }
                );

                // Mark alert as resolved
                alert.resolved = true;
                alert.resolved_at = new Date();
                await alert.save({ session });
            });

            return NextResponse.json({
                success: true,
                message: appendWarning
                    ? "Alert resolved and notification retried with warning"
                    : "Alert resolved and notification retried",
            });
        } finally {
            await session.endSession();
        }
    } catch (error) {
        console.error("Error resolving alert:", error);
        return NextResponse.json(
            { error: "Failed to resolve alert" },
            { status: 500 }
        );
    }
}
