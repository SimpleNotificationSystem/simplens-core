/**
 * Dashboard trends API
 * Returns notification counts over time for charts
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { NotificationModel } from '@/lib/models/notification';

export async function GET(request: NextRequest) {
    try {
        await connectDB();

        const searchParams = request.nextUrl.searchParams;
        const period = searchParams.get('period') || '24h';

        // Calculate time range
        let hoursAgo: number;
        switch (period) {
            case '7d':
                hoursAgo = 24 * 7;
                break;
            case '30d':
                hoursAgo = 24 * 30;
                break;
            case '24h':
            default:
                hoursAgo = 24;
                break;
        }

        const startDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

        // Aggregate by hour for 24h, by day for 7d/30d
        const groupBy = period === '24h'
            ? { $hour: "$created_at" }
            : { $dayOfYear: "$created_at" };

        const trends = await NotificationModel.aggregate([
            {
                $match: {
                    created_at: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        time: groupBy,
                        status: "$status"
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { "_id.time": 1 }
            }
        ]);

        // Transform the data for the frontend
        const formattedTrends = trends.map((item: { _id: { time: number; status: string }; count: number }) => ({
            time: item._id.time,
            status: item._id.status,
            count: item.count
        }));

        return NextResponse.json({
            period,
            startDate: startDate.toISOString(),
            data: formattedTrends
        });
    } catch (error) {
        console.error('Error fetching trends:', error);
        return NextResponse.json(
            { error: 'Failed to fetch trends' },
            { status: 500 }
        );
    }
}
