import type { Request, Response } from 'express';
import alert_model from '@src/database/models/alert.models.js';
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
 * GET /api/alerts
 * Lists unresolved alerts with pagination and type counts
 */
export const listAlerts = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '50', 10);
    const type = req.query.type as string; // Filter by alert type
    const skip = (page - 1) * limit;

    // Build query filter
    const baseFilter: { resolved: boolean; alert_type?: string } = { resolved: false };
    if (type && type !== 'all') {
      baseFilter.alert_type = type;
    }

    // Get filtered count (for pagination)
    const count = await alert_model.countDocuments(baseFilter);

    // Get counts by alert type (always unresolved for summary)
    const countsByType = await alert_model.aggregate([
      { $match: { resolved: false } },
      { $group: { _id: '$alert_type', count: { $sum: 1 } } }
    ]);

    const byType: Record<string, number> = {};
    for (const item of countsByType) {
      byType[item._id] = item.count;
    }

    // Get paginated alerts with optional filter
    const alerts = await alert_model.find(baseFilter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({
      alerts,
      count, // Total unresolved count (not just returned alerts)
      byType, // Counts by alert type
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    });
  } catch (error) {
    logger.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
};

/**
 * DELETE /api/alerts/:id
 * Dismisses an alert without retrying the notification
 */
export const dismissAlert = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid alert ID' });
      return;
    }

    const alert = await alert_model.findByIdAndUpdate(
      id,
      {
        resolved: true,
        resolved_at: new Date(),
      },
      { new: true }
    );

    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    res.json({
      success: true,
      message: 'Alert dismissed',
    });
  } catch (error) {
    logger.error('Error dismissing alert:', error);
    res.status(500).json({ error: 'Failed to dismiss alert' });
  }
};

/**
 * POST /api/alerts/:id/resolve
 * Resolves an alert and retries the notification
 */
export const resolveAlert = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { appendWarning } = req.body as { appendWarning?: boolean };

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid alert ID' });
      return;
    }

    const alert = await alert_model.findById(id);
    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    if (alert.resolved) {
      res.status(400).json({ error: 'Alert already resolved' });
      return;
    }

    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        const notification = await notification_model.findById(alert.notification_id);
        if (!notification) {
          throw new Error('Notification not found');
        }

        // Update content with warning if requested
        if (appendWarning) {
          const warningMessage = '\n\n⚠️ Ignore this message if you already received it!';
          const content = notification.content as Record<string, unknown>;

          const channelContent = content[notification.channel] as Record<string, unknown> | undefined;
          if (channelContent?.message) {
            channelContent.message = String(channelContent.message) + warningMessage;
          } else if (content.message) {
            content.message = String(content.message) + warningMessage;
          }
          notification.markModified('content');
        }

        // Reset notification to pending
        notification.status = NOTIFICATION_STATUS.pending;
        notification.error_message = undefined;
        notification.updated_at = new Date();

        logger.info(`[AlertResolve] Notification ${notification._id}: Retrying with original provider=${notification.provider}`);

        await notification.save({ session });

        // Create outbox entry
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
          retry_count: notification.retry_count,
          created_at: new Date(),
        };

        await outbox_model.create(
          [{ notification_id: notification._id, topic, payload, status: OUTBOX_STATUS.pending }],
          { session }
        );

        // Mark alert as resolved
        alert.resolved = true;
        alert.resolved_at = new Date();
        await alert.save({ session });
      });

      res.json({
        success: true,
        message: appendWarning
          ? 'Alert resolved and notification retried with warning'
          : 'Alert resolved and notification retried',
      });
    } finally {
      await session.endSession();
    }
  } catch (error) {
    logger.error('Error resolving alert:', error);
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
};

/**
 * POST /api/alerts/bulk-resolve
 * Resolves multiple alerts at once
 */
export const bulkResolveAlerts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { appendWarning, limit = 50 } = req.body as {
      appendWarning?: boolean;
      limit?: number;
    };

    const alerts = await alert_model.find({ resolved: false })
      .sort({ created_at: 1 })
      .limit(limit);

    if (alerts.length === 0) {
      res.json({
        success: true,
        resolved: 0,
        message: 'No alerts to resolve',
      });
      return;
    }

    let resolved = 0;
    let failed = 0;

    for (const alert of alerts) {
      const session = await mongoose.startSession();

      try {
        await session.withTransaction(async () => {
          const notification = await notification_model.findById(alert.notification_id);
          if (!notification) {
            failed++;
            return;
          }

          if (appendWarning) {
            const warningMessage = '\n\n⚠️ Ignore this message if you already received it!';
            const content = notification.content as Record<string, unknown>;

            const channelContent = content[notification.channel] as Record<string, unknown> | undefined;
            if (channelContent?.message) {
              channelContent.message = String(channelContent.message) + warningMessage;
            } else if (content.message) {
              content.message = String(content.message) + warningMessage;
            }
            notification.markModified('content');
          }

          notification.status = NOTIFICATION_STATUS.pending;
          notification.error_message = undefined;
          notification.updated_at = new Date();

          await notification.save({ session });

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
            retry_count: notification.retry_count,
            created_at: new Date(),
          };

          await outbox_model.create(
            [{ notification_id: notification._id, topic, payload, status: OUTBOX_STATUS.pending }],
            { session }
          );

          alert.resolved = true;
          alert.resolved_at = new Date();
          await alert.save({ session });

          resolved++;
        });
      } catch (err) {
        logger.error(`Failed to resolve alert ${alert._id}:`, err);
        failed++;
      } finally {
        await session.endSession();
      }
    }

    res.json({
      success: true,
      resolved,
      failed,
      message: `Resolved ${resolved} alerts${failed > 0 ? `, ${failed} failed` : ''}`,
    });
  } catch (error) {
    logger.error('Error bulk resolving alerts:', error);
    res.status(500).json({ error: 'Failed to bulk resolve alerts' });
  }
};
