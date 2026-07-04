import type { Request, Response } from 'express';
import notification_model from '@src/database/models/notification.models.js';
import outbox_model from '@src/database/models/outbox.models.js';
import { NOTIFICATION_STATUS, OUTBOX_STATUS, getTopicForChannel } from '@src/types/types.js';
import mongoose from 'mongoose';
import { apiLogger as logger } from '@src/workers/utils/logger.js';

// Helper to extract channel-specific content for plugins
// Dashboard stores: content: { mock: { message: "..." } }
// Plugin expects: content: { message: "..." }
const extractChannelContent = (content: Record<string, unknown>, channel: string): Record<string, unknown> => {
  const channelContent = content[channel] as Record<string, unknown> | undefined;
  return channelContent || content;
};

/**
 * GET /api/notifications
 * Lists notifications with pagination, sorting, and filtering
 */
export const listNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '20', 10);
    const status = req.query.status as string;
    const channel = req.query.channel as string;
    const provider = req.query.provider as string;
    const search = req.query.search as string;
    const from = req.query.from as string;
    const to = req.query.to as string;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: any = {};

    if (status) {
      filter.status = status;
    }

    if (channel) {
      filter.channel = channel;
    }

    if (provider) {
      filter.provider = provider;
    }

    if (search) {
      filter.$or = [
        { request_id: { $regex: search, $options: 'i' } },
        { client_id: { $regex: search, $options: 'i' } },
        { client_name: { $regex: search, $options: 'i' } }
      ];
      if (/^[a-f0-9]{24}$/i.test(search)) {
        filter.$or.push({ _id: new mongoose.Types.ObjectId(search) });
      }
    }

    if (from || to) {
      filter.created_at = {};
      if (from) filter.created_at.$gte = new Date(from);
      if (to) filter.created_at.$lte = new Date(to);
    }

    const skip = (page - 1) * limit;

    const sortBy = (req.query.sortBy as string) || 'created_at_desc';
    let sortField = 'created_at';
    let sortOrder = 'desc';

    if (sortBy.split('_').length === 3) {
      sortField = sortBy.substring(0, sortBy.lastIndexOf('_'));
      sortOrder = sortBy.substring(sortBy.lastIndexOf('_') + 1);
    } else {
      const lastUnderscore = sortBy.lastIndexOf('_');
      if (lastUnderscore !== -1) {
        sortField = sortBy.substring(0, lastUnderscore);
        sortOrder = sortBy.substring(lastUnderscore + 1);
      }
    }

    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const sortQuery = { [sortField]: sortDirection };

    const [notifications, total] = await Promise.all([
      notification_model.find(filter)
        .sort(sortQuery as Record<string, 1 | -1>)
        .skip(skip)
        .limit(limit)
        .lean(),
      notification_model.countDocuments(filter)
    ]);

    const data = notifications.map((doc) => ({
      _id: doc._id.toString(),
      request_id: doc.request_id,
      client_id: doc.client_id,
      client_name: doc.client_name,
      channel: doc.channel,
      provider: doc.provider,
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

    res.json({
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit
    });
  } catch (error) {
    logger.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

/**
 * GET /api/notifications/recent
 * Returns the latest notifications
 */
export const getRecentNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string || '10', 10);

    const notifications = await notification_model.find()
      .sort({ created_at: -1 })
      .limit(limit)
      .lean();

    const data = notifications.map((doc) => ({
      _id: doc._id.toString(),
      request_id: doc.request_id,
      client_id: doc.client_id,
      client_name: doc.client_name,
      channel: doc.channel,
      provider: doc.provider,
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

    res.json(data);
  } catch (error) {
    logger.error('Error fetching recent notifications:', error);
    res.status(500).json({ error: 'Failed to fetch recent notifications' });
  }
};

/**
 * GET /api/notifications/:id
 * Fetches a single notification by id
 */
export const getNotificationById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid ID' });
      return;
    }

    const notification = await notification_model.findById(id).lean();

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    res.json({
      _id: notification._id.toString(),
      request_id: notification.request_id,
      client_id: notification.client_id,
      client_name: notification.client_name,
      channel: notification.channel,
      provider: notification.provider,
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
    });
  } catch (error) {
    logger.error('Error fetching notification:', error);
    res.status(500).json({ error: 'Failed to fetch notification' });
  }
};

/**
 * DELETE /api/notifications/:id
 * Deletes a single notification by id
 */
export const deleteNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid ID' });
      return;
    }

    const result = await notification_model.findByIdAndDelete(id);

    if (!result) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    logger.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
};

/**
 * POST /api/notifications/:id/retry
 * Resets a failed notification to pending status for reprocessing
 */
export const retryNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid ID' });
      return;
    }

    const notification = await notification_model.findById(id);

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    if (notification.status !== NOTIFICATION_STATUS.failed) {
      res.status(400).json({ error: 'Only failed notifications can be retried' });
      return;
    }

    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        const updateFields = {
          status: NOTIFICATION_STATUS.pending,
          error_message: null,
          retry_count: 0,
          updated_at: new Date()
        };

        logger.info(`[Retry] Notification ${id}: Retrying with original provider=${notification.provider}`);

        await notification_model.findByIdAndUpdate(
          id,
          updateFields,
          { session, new: true }
        );

        const topic = getTopicForChannel(notification.channel);
        const rawContent = notification.content as Record<string, unknown>;
        const extractedContent = extractChannelContent(rawContent, notification.channel);

        const payload = {
          notification_id: notification._id,
          request_id: notification.request_id,
          client_id: notification.client_id,
          channel: notification.channel,
          provider: notification.provider,
          recipient: notification.recipient,
          content: extractedContent,
          variables: notification.variables,
          webhook_url: notification.webhook_url,
          retry_count: 0,
          created_at: new Date()
        };

        await outbox_model.create([{
          notification_id: notification._id,
          topic,
          payload,
          status: OUTBOX_STATUS.pending,
          created_at: new Date(),
          updated_at: new Date()
        }], { session });
      });

      res.json({
        success: true,
        message: 'Notification queued for retry'
      });
    } finally {
      await session.endSession();
    }
  } catch (error) {
    logger.error('Error retrying notification:', error);
    res.status(500).json({ error: 'Failed to retry notification' });
  }
};
