/**
 * Channel Routing Controller
 * 
 * Manages channel default and fallback provider routing and Kafka partition scaling
 */

import { Request, Response } from 'express';
import { ChannelRoutingService } from '@src/plugins/index.js';
import { apiLogger as logger } from '@src/workers/utils/logger.js';

/**
 * GET /api/channels/routing
 * List all channel routings
 */
export const listChannelRoutings = async (_req: Request, res: Response): Promise<void> => {
  try {
    const routings = await ChannelRoutingService.listChannelRoutings();
    res.json({ routings });
  } catch (err) {
    logger.error('Error listing channel routings:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to list channel routings'
    });
  }
};

/**
 * GET /api/channels/routing/:channel
 * Get routing for a specific channel
 */
export const getChannelRouting = async (req: Request, res: Response): Promise<void> => {
  try {
    const routing = await ChannelRoutingService.getChannelRouting(req.params.channel);
    if (!routing) {
      res.status(404).json({
        error: 'Not Found',
        message: `Routing for channel '${req.params.channel}' not found`
      });
      return;
    }

    res.json({ routing });
  } catch (err) {
    logger.error(`Error getting channel routing for '${req.params.channel}':`, err);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve channel routing'
    });
  }
};

/**
 * PUT /api/channels/routing/:channel
 * Set or update routing for a channel
 */
export const setChannelRouting = async (req: Request, res: Response): Promise<void> => {
  try {
    const channel = req.params.channel.trim();
    const { default_provider_id, fallback_provider_ids, partitions } = req.body;

    if (!default_provider_id || typeof default_provider_id !== 'string') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'default_provider_id is required'
      });
      return;
    }

    if (fallback_provider_ids !== undefined && !Array.isArray(fallback_provider_ids)) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'fallback_provider_ids must be an array of provider IDs'
      });
      return;
    }

    if (partitions !== undefined && (typeof partitions !== 'number' || partitions < 1)) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'partitions must be a positive integer'
      });
      return;
    }

    const routing = await ChannelRoutingService.setChannelRouting(channel, {
      default_provider_id,
      fallback_provider_ids,
      partitions,
    });

    res.json({
      message: `Routing for channel '${channel}' updated successfully`,
      routing
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Error updating channel routing for '${req.params.channel}': ${message}`);
    const statusCode = message.includes('Cannot decrease partitions') || message.includes('not found') ? 400 : 500;
    res.status(statusCode).json({
      error: 'Failed to set channel routing',
      message
    });
  }
};

/**
 * DELETE /api/channels/routing/:channel
 * Delete routing for a channel
 */
export const deleteChannelRouting = async (req: Request, res: Response): Promise<void> => {
  try {
    await ChannelRoutingService.deleteChannelRouting(req.params.channel);
    res.json({
      message: `Routing for channel '${req.params.channel}' deleted successfully`
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Error deleting channel routing for '${req.params.channel}': ${message}`);
    res.status(500).json({
      error: 'Failed to delete channel routing',
      message
    });
  }
};
