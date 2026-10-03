/**
 * Channel Routing Service
 * 
 * Manages channel default/cascading fallback provider configuration,
 * dynamic Kafka partition scaling, and Redis pub/sub synchronization.
 */

import ChannelRouting from '@src/database/models/channel-routing.models.js';
import Provider from '@src/database/models/provider.models.js';
import { PluginRegistry } from '@src/plugins/loader/registry.js';
import { PluginSyncService } from '@src/plugins/sync/plugin-sync.service.js';
import { expandTopicPartitions, ensureChannelTopic } from '@src/config/kafka.config.js';
import type { channel_routing_document } from '@src/types/types.js';
import { pluginLoaderLogger as logger } from '@src/workers/utils/logger.js';

export class ChannelRoutingService {
  /**
   * List all configured channel routings
   */
  public static async listChannelRoutings(): Promise<channel_routing_document[]> {
    return (await ChannelRouting.find().sort({ channel: 1 }).lean()) as channel_routing_document[];
  }

  /**
   * Get routing configuration for a specific channel
   */
  public static async getChannelRouting(channel: string): Promise<channel_routing_document | null> {
    return (await ChannelRouting.findOne({ channel }).lean()) as channel_routing_document | null;
  }

  /**
   * Set or update channel routing configuration and expand Kafka partitions if requested
   */
  public static async setChannelRouting(
    channel: string,
    data: {
      default_provider_id: string;
      fallback_provider_ids?: string[];
      partitions?: number;
    }
  ): Promise<channel_routing_document> {
    logger.info(`Updating channel routing for '${channel}'...`);

    // 1. Validate default provider
    const defaultProvider = await Provider.findOne({ id: data.default_provider_id });
    if (!defaultProvider) {
      throw new Error(`Default provider '${data.default_provider_id}' not found.`);
    }
    if (defaultProvider.channel !== channel) {
      throw new Error(
        `Default provider '${data.default_provider_id}' is configured for channel '${defaultProvider.channel}', not '${channel}'.`
      );
    }

    // 2. Validate fallback providers
    const fallbacks = data.fallback_provider_ids || [];
    for (const fId of fallbacks) {
      const fProvider = await Provider.findOne({ id: fId });
      if (!fProvider) {
        throw new Error(`Fallback provider '${fId}' not found.`);
      }
      if (fProvider.channel !== channel) {
        throw new Error(
          `Fallback provider '${fId}' is configured for channel '${fProvider.channel}', not '${channel}'.`
        );
      }
    }

    // 3. Handle dynamic Kafka topic creation and partition scaling
    const existing = await ChannelRouting.findOne({ channel });
    const currentPartitions = existing?.partitions || 6;
    const desiredPartitions = data.partitions !== undefined ? data.partitions : currentPartitions;

    if (existing && desiredPartitions < currentPartitions) {
      throw new Error(
        `Cannot decrease partitions for channel '${channel}' from ${currentPartitions} to ${desiredPartitions}. Kafka partitions can only be increased.`
      );
    }

    try {
      if (desiredPartitions > currentPartitions) {
        logger.info(
          `Requesting Kafka partition expansion for channel '${channel}' from ${currentPartitions} to ${desiredPartitions}...`
        );
        await expandTopicPartitions(channel, desiredPartitions);
      } else {
        await ensureChannelTopic(channel, desiredPartitions);
      }
    } catch (kafkaErr) {
      logger.error(`Failed to configure Kafka topic for channel '${channel}':`, kafkaErr);
      throw new Error(`Failed to expand Kafka partitions: ${(kafkaErr as Error).message}`, {
        cause: kafkaErr,
      });
    }

    // 4. Save to MongoDB
    const routing = await ChannelRouting.findOneAndUpdate(
      { channel },
      {
        channel,
        default_provider_id: data.default_provider_id,
        fallback_provider_ids: fallbacks,
        partitions: desiredPartitions,
      },
      { upsert: true, new: true }
    );

    // 5. Update local PluginRegistry
    PluginRegistry.setChannelConfig(channel, {
      default: data.default_provider_id,
      fallback: fallbacks,
    });

    // 6. Broadcast sync event
    await PluginSyncService.publish('CHANNEL_ROUTING_UPDATED', {
      channel,
    });

    logger.success(`Channel routing for '${channel}' updated successfully.`);
    return routing.toObject() as channel_routing_document;
  }

  /**
   * Delete routing configuration for a channel
   */
  public static async deleteChannelRouting(channel: string): Promise<void> {
    logger.info(`Deleting channel routing for '${channel}'...`);
    await ChannelRouting.deleteOne({ channel });

    PluginRegistry.setChannelConfig(channel, {
      default: '',
      fallback: [],
    });

    await PluginSyncService.publish('CHANNEL_ROUTING_UPDATED', {
      channel,
    });
    logger.success(`Channel routing for '${channel}' deleted.`);
  }

  /**
   * Register remote synchronization handlers with Redis Pub/Sub
   */
  public static registerSyncHandlers(): void {
    PluginSyncService.on('CHANNEL_ROUTING_UPDATED', async (msg) => {
      const { channel } = msg.payload;
      if (!channel) return;

      logger.info(`Sync: Handling remote CHANNEL_ROUTING_UPDATED for '${channel}'...`);
      const routing = await ChannelRouting.findOne({ channel });

      if (routing) {
        PluginRegistry.setChannelConfig(channel, {
          default: routing.default_provider_id,
          fallback: routing.fallback_provider_ids || [],
        });
      } else {
        PluginRegistry.setChannelConfig(channel, {
          default: '',
          fallback: [],
        });
      }
    });
  }
}
