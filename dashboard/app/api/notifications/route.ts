/**
 * Notifications list API
 * Returns paginated list of notifications with filtering
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { NotificationModel } from '@/lib/models/notification';
import type { PaginatedResponse, Notification, NOTIFICATION_STATUS, Channel } from '@/lib/types';

// Define filter type inline to avoid mongoose version issues
interface NotificationFilter {
    status?: string;
    channel?: string;
    created_at?: { $gte?: Date; $lte?: Date };
    $or?: Array<Record<string, { $regex: string; $options: string }>>;
}

export async function GET(request: NextRequest) {
    try {
        await connectDB();

        const searchParams = request.nextUrl.searchParams;
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const status = searchParams.get('status') as NOTIFICATION_STATUS | null;
        const channel = searchParams.get('channel') as Channel | null;
        const search = searchParams.get('search');
        const from = searchParams.get('from');
        const to = searchParams.get('to');

        // Build filter query
        const filter: NotificationFilter = {};

        if (status) {
            filter.status = status;
        }

        if (channel) {
            filter.channel = channel;
        }

        if (search) {
            filter.$or = [
                { request_id: { $regex: search, $options: 'i' } },
                { 'recipient.email': { $regex: search, $options: 'i' } },
                { 'recipient.phone': { $regex: search, $options: 'i' } },
                { 'recipient.user_id': { $regex: search, $options: 'i' } },
                { client_id: { $regex: search, $options: 'i' } }
            ];
        }

        if (from || to) {
            filter.created_at = {};
            if (from) filter.created_at.$gte = new Date(from);
            if (to) filter.created_at.$lte = new Date(to);
        }

        const skip = (page - 1) * limit;

        // Parse sort parameter
        const sortBy = searchParams.get('sortBy') || 'created_at_desc';
        const [sortField, sortOrder] = sortBy.split('_').length === 3
            ? [sortBy.substring(0, sortBy.lastIndexOf('_')), sortBy.substring(sortBy.lastIndexOf('_') + 1)]
            : ['created_at', 'desc'];
        const sortDirection = sortOrder === 'asc' ? 1 : -1;
        const sortQuery = { [sortField]: sortDirection };

        const [notifications, total] = await Promise.all([
            NotificationModel.find(filter)
                .sort(sortQuery as Record<string, 1 | -1>)
                .skip(skip)
                .limit(limit)
                .lean(),
            NotificationModel.countDocuments(filter)
        ]);

        // Transform MongoDB documents to our type
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

        const response: PaginatedResponse<Notification> = {
            data,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            limit
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        return NextResponse.json(
            { error: 'Failed to fetch notifications' },
            { status: 500 }
        );
    }
}
