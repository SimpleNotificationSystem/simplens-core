/**
 * API Route: POST /api/alerts/bulk-resolve
 * Resolves multiple alerts at once
 * Channel-agnostic
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import AlertModel from "@/lib/models/alert";
import { NotificationModel } from "@/lib/models/notification";
import OutboxModel from "@/lib/models/outbox";

// Helper to get topic from channel
const getTopicForChannel = (channel: string): string => `${channel}_notification`;

export async function POST(request: NextRequest) {
    try {
        await connectDB();

        const body = await request.json();
        const { appendWarning, limit = 50 } = body;

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

                    // Update content with warning if requested
                    if (appendWarning) {
                        const warningMessage = "\n\n⚠️ Ignore this message if you already received it!";
                        const content = notification.content as Record<string, unknown>;

                        // Try to append to channel-specific message
                        const channelContent = content[notification.channel] as Record<string, unknown> | undefined;
                        if (channelContent?.message) {
                            channelContent.message = String(channelContent.message) + warningMessage;
                        } else if (content.message) {
                            content.message = String(content.message) + warningMessage;
                        }
                    }

                    // Reset notification to pending
                    notification.status = "pending";
                    notification.error_message = undefined;
                    notification.updated_at = new Date();
                    await notification.save({ session });

                    // Create outbox entry with dynamic topic
                    const topic = getTopicForChannel(notification.channel);
                    const payload = {
                        notification_id: notification._id,
                        request_id: notification.request_id,
                        client_id: notification.client_id,
                        channel: notification.channel,
                        recipient: notification.recipient,
                        content: notification.content,
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
