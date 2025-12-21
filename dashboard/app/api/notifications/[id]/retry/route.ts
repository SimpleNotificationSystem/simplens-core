/**
 * Retry notification API
 * Resets a failed notification to pending status for reprocessing
 * Channel-agnostic
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { NotificationModel } from '@/lib/models/notification';
import OutboxModel from '@/lib/models/outbox';
import { NOTIFICATION_STATUS } from '@/lib/types';
import mongoose from 'mongoose';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// Helper to get topic from channel
const getTopicForChannel = (channel: string): string => `${channel}_notification`;

// Helper to extract channel-specific content for plugins
// Dashboard stores: content: { mock: { message: "..." } }
// Plugin expects: content: { message: "..." }
const extractChannelContent = (content: Record<string, unknown>, channel: string): Record<string, unknown> => {
    const channelContent = content[channel] as Record<string, unknown> | undefined;
    return channelContent || content;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        await connectDB();
        const { id } = await params;

        // Find the notification
        const notification = await NotificationModel.findById(id);

        if (!notification) {
            return NextResponse.json(
                { error: 'Notification not found' },
                { status: 404 }
            );
        }

        // Only allow retry for failed notifications
        if (notification.status !== NOTIFICATION_STATUS.failed) {
            return NextResponse.json(
                { error: 'Only failed notifications can be retried' },
                { status: 400 }
            );
        }

        // Start a session for atomic operations
        const session = await mongoose.startSession();

        try {
            await session.withTransaction(async () => {
                // Reset the notification status to pending
                await NotificationModel.findByIdAndUpdate(
                    id,
                    {
                        status: NOTIFICATION_STATUS.pending,
                        error_message: null,
                        retry_count: 0,
                        updated_at: new Date()
                    },
                    { session }
                );

                // Determine the topic based on channel dynamically
                const topic = getTopicForChannel(notification.channel);

                // Extract channel-specific content for plugin validation
                // Dashboard stores: content: { mock: { message: "..." } }
                // Plugin expects: content: { message: "..." }
                const rawContent = notification.content as Record<string, unknown>;
                const extractedContent = extractChannelContent(rawContent, notification.channel);

                // Build the payload for the outbox (channel-agnostic)
                const payload = {
                    notification_id: notification._id,
                    request_id: notification.request_id,
                    client_id: notification.client_id,
                    channel: notification.channel,
                    recipient: notification.recipient,
                    content: extractedContent,
                    variables: notification.variables,
                    webhook_url: notification.webhook_url,
                    retry_count: 0,
                    created_at: new Date()
                };

                // Insert into outbox for processing
                await OutboxModel.create([{
                    notification_id: notification._id,
                    topic,
                    payload,
                    status: 'pending',
                    created_at: new Date(),
                    updated_at: new Date()
                }], { session });
            });

            return NextResponse.json({
                success: true,
                message: 'Notification queued for retry'
            });
        } finally {
            await session.endSession();
        }
    } catch (error) {
        console.error('Error retrying notification:', error);
        return NextResponse.json(
            { error: 'Failed to retry notification' },
            { status: 500 }
        );
    }
}
