/**
 * Unit Tests for Dynamic Kafka Topic Management in kafka.config.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { kafka, ensureChannelTopic, expandTopicPartitions } from '../../../src/config/kafka.config.js';

describe('Dynamic Kafka Topics', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('ensureChannelTopic', () => {
    it('should create missing channel topic with default 6 partitions', async () => {
      const adminMock = {
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        listTopics: vi.fn().mockResolvedValue([]),
        createTopics: vi.fn().mockResolvedValue(true),
        fetchTopicMetadata: vi.fn().mockResolvedValue({ topics: [] }),
      };

      vi.spyOn(kafka, 'admin').mockReturnValue(adminMock as any);

      await ensureChannelTopic('email');

      expect(adminMock.connect).toHaveBeenCalled();
      expect(adminMock.listTopics).toHaveBeenCalled();
      expect(adminMock.createTopics).toHaveBeenCalledWith({
        topics: [
          {
            topic: 'email_notification',
            numPartitions: 6,
            replicationFactor: 1,
          },
        ],
        validateOnly: false,
        timeout: 30000,
      });
      expect(adminMock.disconnect).toHaveBeenCalled();
    });

    it('should pass custom partition count to createTopics', async () => {
      const adminMock = {
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        listTopics: vi.fn().mockResolvedValue([]),
        createTopics: vi.fn().mockResolvedValue(true),
        fetchTopicMetadata: vi.fn().mockResolvedValue({ topics: [] }),
      };

      vi.spyOn(kafka, 'admin').mockReturnValue(adminMock as any);

      await ensureChannelTopic('sms', 12);

      expect(adminMock.createTopics).toHaveBeenCalledWith({
        topics: [
          {
            topic: 'sms_notification',
            numPartitions: 12,
            replicationFactor: 1,
          },
        ],
        validateOnly: false,
        timeout: 30000,
      });
    });

    it('should not call admin.createTopics if topic already exists and partitions match', async () => {
      const adminMock = {
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        listTopics: vi.fn().mockResolvedValue(['email_notification']),
        createTopics: vi.fn().mockResolvedValue(true),
        fetchTopicMetadata: vi.fn().mockResolvedValue({
          topics: [
            {
              name: 'email_notification',
              partitions: new Array(6).fill({}),
            },
          ],
        }),
      };

      vi.spyOn(kafka, 'admin').mockReturnValue(adminMock as any);

      await ensureChannelTopic('email', 6);

      expect(adminMock.createTopics).not.toHaveBeenCalled();
    });
  });

  describe('expandTopicPartitions', () => {
    it('should create topic if topic is not found in Kafka metadata', async () => {
      const adminMock = {
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        fetchTopicMetadata: vi.fn().mockResolvedValue({
          topics: [],
        }),
        createTopics: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(kafka, 'admin').mockReturnValue(adminMock as any);

      const result = await expandTopicPartitions('push', 8);

      expect(adminMock.createTopics).toHaveBeenCalledWith({
        topics: [
          {
            topic: 'push_notification',
            numPartitions: 8,
            replicationFactor: 1,
          },
        ],
        validateOnly: false,
        timeout: 30000,
      });
      expect(result).toEqual({ previous: 0, current: 8 });
    });

    it('should expand partitions if requested count exceeds current count', async () => {
      const adminMock = {
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        fetchTopicMetadata: vi.fn().mockResolvedValue({
          topics: [
            {
              name: 'email_notification',
              partitions: new Array(6).fill({}),
            },
          ],
        }),
        createPartitions: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(kafka, 'admin').mockReturnValue(adminMock as any);

      const result = await expandTopicPartitions('email', 10);

      expect(adminMock.createPartitions).toHaveBeenCalledWith({
        topicPartitions: [
          {
            topic: 'email_notification',
            count: 10,
          },
        ],
      });
      expect(result).toEqual({ previous: 6, current: 10 });
    });

    it('should throw error if attempting to decrease partitions', async () => {
      const adminMock = {
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        fetchTopicMetadata: vi.fn().mockResolvedValue({
          topics: [
            {
              name: 'email_notification',
              partitions: new Array(10).fill({}),
            },
          ],
        }),
      };

      vi.spyOn(kafka, 'admin').mockReturnValue(adminMock as any);

      await expect(expandTopicPartitions('email', 4)).rejects.toThrow(
        'Kafka partition count cannot be decreased'
      );
    });
  });
});
