/**
 * Single notification API
 * GET: Fetch a single notification
 * DELETE: Remove a notification
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { NotificationModel } from '@/lib/models/notification';
import type { Notification } from '@/lib/types';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        await connectDB();
        const { id } = await params;

        const notification = await NotificationModel.findById(id).lean();

        if (!notification) {
            return NextResponse.json(
                { error: 'Notification not found' },
                { status: 404 }
            );
        }

        const data: Notification = {
            _id: notification._id.toString(),
            request_id: notification.request_id,
            client_id: notification.client_id,
            client_name: notification.client_name,
            channel: notification.channel,
            recipient: notification.recipient,
            content: notification.content,
            variables: notification.variables ?? undefined,
            webhook_url: notification.webhook_url,
            status: notification.status,
            scheduled_at: notification.scheduled_at,
            error_message: notification.error_message,
            retry_count: notification.retry_count,
            created_at: notification.created_at,
            updated_at: notification.updated_at
        };

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching notification:', error);
        return NextResponse.json(
            { error: 'Failed to fetch notification' },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        await connectDB();
        const { id } = await params;

        const result = await NotificationModel.findByIdAndDelete(id);

        if (!result) {
            return NextResponse.json(
                { error: 'Notification not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        console.error('Error deleting notification:', error);
        return NextResponse.json(
            { error: 'Failed to delete notification' },
            { status: 500 }
        );
    }
}
