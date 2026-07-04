import type { Request, Response } from 'express';
import admin_channel_model from '@src/database/models/admin-channel.models.js';
import { getOrCreateEncryptionKey } from '@src/admin-alerts/key-manager.js';
import { encrypt } from '@src/utils/encryption.utils.js';
import { getChannelProvider, hasChannelProvider } from '@src/admin-alerts/channel-registry.js';
import type { AdminChannelType } from '@src/types/types.js';
import mongoose from 'mongoose';
import { apiLogger as logger } from '@src/workers/utils/logger.js';

/**
 * GET /api/admin-channels
 * Lists all admin channels, excluding the encrypted config
 */
export const listAdminChannels = async (req: Request, res: Response): Promise<void> => {
  try {
    const channels = await admin_channel_model.find({})
      .select('-config') // Exclude encrypted config for security
      .sort({ created_at: -1 })
      .lean();

    res.json({ channels });
  } catch (error) {
    logger.error('Error fetching admin channels:', error);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
};

/**
 * POST /api/admin-channels
 * Creates a new admin channel (validates config first)
 */
export const createAdminChannel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { channel_type, name, config, alert_filters } = req.body;

    // Validate required fields
    if (!channel_type || !name || !config) {
      res.status(400).json({ error: 'Missing required fields: channel_type, name, config' });
      return;
    }

    // Validate channel config
    if (!hasChannelProvider(channel_type as AdminChannelType)) {
      res.status(400).json({ error: `Unsupported channel type: ${channel_type}` });
      return;
    }

    // Validate against schema
    const providerInstance = getChannelProvider(channel_type as AdminChannelType, config);
    const schema = providerInstance.getCredentialSchema();
    const errors: string[] = [];

    for (const field of schema) {
      const value = config[field.name];
      if (field.required && (!value || value.trim() === '')) {
        errors.push(`${field.label} is required`);
        continue;
      }
      if (value && field.pattern) {
        const regex = new RegExp(field.pattern);
        if (!regex.test(value)) {
          errors.push(`${field.label} has invalid format`);
        }
      }
    }

    if (errors.length > 0) {
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }

    // Encrypt config before storing
    const encryptionKey = await getOrCreateEncryptionKey();
    const encryptedConfig = encrypt(JSON.stringify(config), encryptionKey);

    const channel = await admin_channel_model.create({
      channel_type,
      name,
      enabled: true,
      config: encryptedConfig,
      alert_filters: alert_filters || {
        failed_notifications: true,
        service_health: true,
        stuck_processing: true,
        orphaned_pending: true,
        ghost_delivery: false,
      },
    });

    const channelObj = channel.toObject();
    // Delete config from response object
    delete (channelObj as Record<string, unknown>).config;

    res.status(201).json({ success: true, channel: channelObj });
  } catch (error) {
    logger.error('Error creating admin channel:', error);
    res.status(500).json({ error: 'Failed to create channel' });
  }
};

/**
 * GET /api/admin-channels/:id
 * Fetches a single admin channel by id (excluding config)
 */
export const getAdminChannelById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid ID' });
      return;
    }

    const channel = await admin_channel_model.findById(id)
      .select('-config')
      .lean();

    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    res.json({ channel });
  } catch (error) {
    logger.error('Error fetching channel:', error);
    res.status(500).json({ error: 'Failed to fetch channel' });
  }
};

/**
 * PATCH /api/admin-channels/:id
 * Updates an admin channel
 */
export const updateAdminChannel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid ID' });
      return;
    }

    const body = req.body;
    const updateData: Record<string, unknown> = {};

    if (body.name) updateData.name = body.name;
    if (typeof body.enabled === 'boolean') updateData.enabled = body.enabled;
    if (body.alert_filters) updateData.alert_filters = body.alert_filters;

    // If config is being updated, validate and re-encrypt it
    if (body.config) {
      const existingChannel = await admin_channel_model.findById(id).lean();
      if (!existingChannel) {
        res.status(404).json({ error: 'Channel not found' });
        return;
      }

      const channelType = existingChannel.channel_type;

      // Validate config
      const providerInstance = getChannelProvider(channelType as AdminChannelType, body.config);
      const schema = providerInstance.getCredentialSchema();
      const errors: string[] = [];

      for (const field of schema) {
        const value = body.config[field.name];
        if (field.required && (!value || value.trim() === '')) {
          errors.push(`${field.label} is required`);
          continue;
        }
        if (value && field.pattern) {
          const regex = new RegExp(field.pattern);
          if (!regex.test(value)) {
            errors.push(`${field.label} has invalid format`);
          }
        }
      }

      if (errors.length > 0) {
        res.status(400).json({ error: 'Validation failed', details: errors });
        return;
      }

      const key = await getOrCreateEncryptionKey();
      updateData.config = encrypt(JSON.stringify(body.config), key);
    }

    const channel = await admin_channel_model.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).select('-config').lean();

    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    res.json({ success: true, channel });
  } catch (error) {
    logger.error('Error updating channel:', error);
    res.status(500).json({ error: 'Failed to update channel' });
  }
};

/**
 * DELETE /api/admin-channels/:id
 * Deletes an admin channel by id
 */
export const deleteAdminChannel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid ID' });
      return;
    }

    const result = await admin_channel_model.findByIdAndDelete(id);

    if (!result) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    res.json({ success: true, message: 'Channel deleted' });
  } catch (error) {
    logger.error('Error deleting channel:', error);
    res.status(500).json({ error: 'Failed to delete channel' });
  }
};
