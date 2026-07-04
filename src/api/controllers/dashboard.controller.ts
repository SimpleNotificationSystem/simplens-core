import type { Request, Response } from 'express';
import notification_model from '@src/database/models/notification.models.js';
import { apiLogger as logger } from '@src/workers/utils/logger.js';

/**
 * GET /api/dashboard/stats
 * Returns notification statistics grouped by status and channel
 */
export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    // Aggregate stats by status
    const statusStats = await notification_model.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          processing: { $sum: { $cond: [{ $eq: ['$status', 'processing'] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }
        }
      }
    ]);

    // Aggregate by channel - dynamic
    const channelStats = await notification_model.aggregate([
      {
        $group: {
          _id: '$channel',
          count: { $sum: 1 }
        }
      }
    ]);

    const byChannel: Record<string, number> = {};
    channelStats.forEach((item: { _id: string; count: number }) => {
      if (item._id) {
        byChannel[item._id] = item.count;
      }
    });

    const stats = statusStats.length > 0
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

    res.json(stats);
  } catch (error) {
    logger.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
};

/**
 * GET /api/dashboard/trends
 * Returns notification counts over time for trends charts
 */
export const getDashboardTrends = async (req: Request, res: Response): Promise<void> => {
  try {
    const period = (req.query.period as string) || '24h';

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
      ? { $hour: '$created_at' }
      : { $dayOfYear: '$created_at' };

    const trends = await notification_model.aggregate([
      {
        $match: {
          created_at: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            time: groupBy,
            status: '$status'
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.time': 1 }
      }
    ]);

    // Transform the data for the frontend
    const formattedTrends = trends.map((item: { _id: { time: number; status: string }; count: number }) => ({
      time: item._id.time,
      status: item._id.status,
      count: item.count
    }));

    res.json({
      period,
      startDate: startDate.toISOString(),
      data: formattedTrends
    });
  } catch (error) {
    logger.error('Error fetching trends:', error);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
};
