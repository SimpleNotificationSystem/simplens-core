/**
 * Dashboard statistics API
 * Returns aggregate counts for notifications with dynamic channel support
 */

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { NotificationModel } from '@/lib/models/notification';
import type { DashboardStats } from '@/lib/types';

export async function GET() {
    try {
        await connectDB();

        // Aggregate stats by status
        const statusStats = await NotificationModel.aggregate([
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
                    processing: { $sum: { $cond: [{ $eq: ["$status", "processing"] }, 1, 0] } },
                    delivered: { $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] } },
                    failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } }
                }
            }
        ]);

        // Aggregate by channel - dynamic, not hardcoded
        const channelStats = await NotificationModel.aggregate([
            {
                $group: {
                    _id: "$channel",
                    count: { $sum: 1 }
                }
            }
        ]);

        // Build dynamic byChannel object
        const byChannel: Record<string, number> = {};
        channelStats.forEach((item: { _id: string; count: number }) => {
            if (item._id) {
                byChannel[item._id] = item.count;
            }
        });

        const stats: DashboardStats = statusStats.length > 0
            ? {
                total: statusStats[0].total,
                pending: statusStats[0].pending,
                processing: statusStats[0].processing,
                delivered: statusStats[0].delivered,
                failed: statusStats[0].failed,
                byChannel
            }
            : {
                total: 0,
                pending: 0,
                processing: 0,
                delivered: 0,
                failed: 0,
                byChannel
            };

        return NextResponse.json(stats);
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        return NextResponse.json(
            { error: 'Failed to fetch dashboard statistics' },
            { status: 500 }
        );
    }
}
