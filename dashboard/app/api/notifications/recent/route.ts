/**
 * Recent notifications API
 * Returns the latest notifications for the activity feed
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { NotificationModel } from '@/lib/models/notification';
import type { Notification } from '@/lib/types';

export async function GET(request: NextRequest) {
    try {
        await connectDB();

        const searchParams = request.nextUrl.searchParams;
        const limit = parseInt(searchParams.get('limit') || '10');

        const notifications = await NotificationModel.find()
            .sort({ created_at: -1 })
            .limit(limit)
            .lean();

        const data: Notification[] = notifications.map((doc) => ({
            _id: doc._id.toString(),
            request_id: doc.request_id,
            client_id: doc.client_id,
            client_name: doc.client_name,
            channel: doc.channel,
            recipient: doc.recipient,
            content: doc.content,
            variables: doc.variables ?? undefined,
            webhook_url: doc.webhook_url,
            status: doc.status,
            scheduled_at: doc.scheduled_at,
            error_message: doc.error_message,
            retry_count: doc.retry_count,
            created_at: doc.created_at,
            updated_at: doc.updated_at
        }));

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching recent notifications:', error);
        return NextResponse.json(
            { error: 'Failed to fetch recent notifications' },
            { status: 500 }
        );
    }
}
