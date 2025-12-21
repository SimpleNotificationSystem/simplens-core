/**
 * API Route: POST /api/alerts/[id]/resolve
 * Resolves an alert and retries the notification
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

// Helper to extract channel-specific content for plugins
// Dashboard stores: content: { mock: { message: "..." } }
// Plugin expects: content: { message: "..." }
const extractChannelContent = (content: Record<string, unknown>, channel: string): Record<string, unknown> => {
    const channelContent = content[channel] as Record<string, unknown> | undefined;
    return channelContent || content;
};

// Helper to get message from content (handles any channel)
const getMessageFromContent = (content: Record<string, unknown>, channel: string): string | undefined => {
    // Try channel-specific key first (e.g., content.email.message)
    const channelContent = content[channel] as Record<string, unknown> | undefined;
    if (channelContent?.message) {
        return String(channelContent.message);
    }
    // Fallback to top-level message
    if (content.message) {
        return String(content.message);
    }
    return undefined;
};

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        await connectDB();

        const body = await request.json();
        const { appendWarning } = body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json(
                { error: "Invalid alert ID" },
                { status: 400 }
            );
        }

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
                // Extract channel-specific content for plugin validation
                const rawContent = notification.content as Record<string, unknown>;
                const extractedContent = extractChannelContent(rawContent, notification.channel);

                const payload = {
                    notification_id: notification._id,
                    request_id: notification.request_id,
                    client_id: notification.client_id,
                    channel: notification.channel,
                    recipient: notification.recipient,
                    content: extractedContent,
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
