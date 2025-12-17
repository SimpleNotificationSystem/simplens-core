/**
 * API Route: POST /api/alerts/bulk-resolve
 * Resolves multiple alerts at once
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import AlertModel from "@/lib/models/alert";
import { NotificationModel } from "@/lib/models/notification";
import OutboxModel from "@/lib/models/outbox";
import { CHANNEL } from "@/lib/types";

export async function POST(request: NextRequest) {
    try {
        await connectDB();

        const body = await request.json();
        const { appendWarning, limit = 50 } = body;

        // Get unresolved alerts
        const alerts = await AlertModel.find({ resolved: false })
            .sort({ created_at: 1 })
            .limit(limit);

        if (alerts.length === 0) {
            return NextResponse.json({
                success: true,
                resolved: 0,
                message: "No alerts to resolve",
            });
        }

        let resolved = 0;
        let failed = 0;

        for (const alert of alerts) {
            const session = await mongoose.startSession();

            try {
                await session.withTransaction(async () => {
                    const notification = await NotificationModel.findById(alert.notification_id);
                    if (!notification) {
                        failed++;
                        return;
                    }

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

                    // Create outbox entry
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
                        [{ notification_id: notification._id, topic, payload, status: "pending" }],
                        { session }
                    );

                    // Mark alert as resolved
                    alert.resolved = true;
                    alert.resolved_at = new Date();
                    await alert.save({ session });

                    resolved++;
                });
            } catch (err) {
                console.error(`Failed to resolve alert ${alert._id}:`, err);
                failed++;
            } finally {
                await session.endSession();
            }
        }

        return NextResponse.json({
            success: true,
            resolved,
            failed,
            message: `Resolved ${resolved} alerts${failed > 0 ? `, ${failed} failed` : ""}`,
        });
    } catch (error) {
        console.error("Error bulk resolving alerts:", error);
        return NextResponse.json(
            { error: "Failed to bulk resolve alerts" },
            { status: 500 }
        );
    }
}
