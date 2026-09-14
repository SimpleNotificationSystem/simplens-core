/**
 * Unit Tests for ChannelRoutingService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChannelRoutingService } from '../../../src/plugins/services/channel-routing.service.js';
import ChannelRouting from '../../../src/database/models/channel-routing.models.js';
import Provider from '../../../src/database/models/provider.models.js';
import { PluginRegistry } from '../../../src/plugins/loader/registry.js';
import { PluginSyncService } from '../../../src/plugins/sync/plugin-sync.service.js';
import * as kafkaConfig from '../../../src/config/kafka.config.js';

describe('ChannelRoutingService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    PluginRegistry.clear();
    vi.spyOn(PluginSyncService, 'publish').mockResolvedValue(undefined);
  });

  describe('setChannelRouting', () => {
    it('should throw error if default provider is not found', async () => {
      vi.spyOn(Provider, 'findOne').mockResolvedValue(null);

      await expect(
        ChannelRoutingService.setChannelRouting('email', {
          default_provider_id: 'nonexistent',
        })
      ).rejects.toThrow("Default provider 'nonexistent' not found.");
    });

    it('should throw error if default provider belongs to a different channel', async () => {
      vi.spyOn(Provider, 'findOne').mockResolvedValue({
        id: 'sms-tw',
        channel: 'sms',
      } as any);

      await expect(
        ChannelRoutingService.setChannelRouting('email', {
          default_provider_id: 'sms-tw',
        })
      ).rejects.toThrow(
        "Default provider 'sms-tw' is configured for channel 'sms', not 'email'."
      );
    });

    it('should throw error if partitions are decreased', async () => {
      vi.spyOn(Provider, 'findOne').mockResolvedValue({
        id: 'email-primary',
        channel: 'email',
      } as any);
      vi.spyOn(ChannelRouting, 'findOne').mockResolvedValue({
        channel: 'email',
        partitions: 8,
      } as any);

      await expect(
        ChannelRoutingService.setChannelRouting('email', {
          default_provider_id: 'email-primary',
          partitions: 4,
        })
      ).rejects.toThrow(
        "Cannot decrease partitions for channel 'email' from 8 to 4. Kafka partitions can only be increased."
      );
    });

    it('should expand Kafka partitions when partition count is increased and update DB', async () => {
      vi.spyOn(Provider, 'findOne').mockImplementation(async (query: any) => {
        if (query.id === 'email-primary') {
          return { id: 'email-primary', channel: 'email' } as any;
        }
        if (query.id === 'email-fb-1') {
          return { id: 'email-fb-1', channel: 'email' } as any;
        }
        return null;
      });

      vi.spyOn(ChannelRouting, 'findOne').mockResolvedValue({
        channel: 'email',
        partitions: 6,
      } as any);

      const expandSpy = vi
        .spyOn(kafkaConfig, 'expandTopicPartitions')
        .mockResolvedValue(undefined);

      const updatedRouting = {
        channel: 'email',
        default_provider_id: 'email-primary',
        fallback_provider_ids: ['email-fb-1'],
        partitions: 12,
        toObject: () => updatedRouting,
      };

      vi.spyOn(ChannelRouting, 'findOneAndUpdate').mockResolvedValue(updatedRouting as any);
      const setConfigSpy = vi.spyOn(PluginRegistry, 'setChannelConfig');

      const result = await ChannelRoutingService.setChannelRouting('email', {
        default_provider_id: 'email-primary',
        fallback_provider_ids: ['email-fb-1'],
        partitions: 12,
      });

      expect(expandSpy).toHaveBeenCalledWith('email', 12);
      expect(setConfigSpy).toHaveBeenCalledWith('email', {
        default: 'email-primary',
        fallback: ['email-fb-1'],
      });
      expect(PluginSyncService.publish).toHaveBeenCalledWith('CHANNEL_ROUTING_UPDATED', {
        channel: 'email',
      });
      expect(result.partitions).toBe(12);
    });
  });
});
