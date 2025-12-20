import { Kafka, Admin, ITopicConfig } from "kafkajs";
import { env } from "./env.config.js";
import { producerLogger as logger } from "@src/workers/utils/logger.js";
import { getConfiguredChannels } from '@src/plugins/index.js';
import { getTopicForChannel, CORE_TOPICS } from '@src/types/types.js';

export const kafka = new Kafka({
    clientId: "notification-service",
    brokers: env.BROKERS
});

/**
 * Build Kafka topics dynamically from configuration
 */
export const buildKafkaTopics = (): { topic: string; numPartitions: number; replicationFactor: number }[] => {
    // Core topics that are always present
    const topics: { topic: string; numPartitions: number; replicationFactor: number }[] = [
        {
            topic: CORE_TOPICS.delayed_notification,
            numPartitions: env.DELAYED_PARTITION,
            replicationFactor: 1
        },
        {
            topic: CORE_TOPICS.notification_status,
            numPartitions: env.NOTIFICATION_STATUS_PARTITION,
            replicationFactor: 1
        },
    ];

    // Dynamic channel topics from simplens.config.yaml
    const channels = getConfiguredChannels();

    if (channels.length === 0) {
        logger.warn('No channels configured in simplens.config.yaml - no channel topics will be created');
    }

    for (const channel of channels) {
        // Check for channel-specific partition env var (e.g., EMAIL_PARTITION)
        const partitionEnvKey = `${channel.toUpperCase()}_PARTITION`;
        const partitions = parseInt(process.env[partitionEnvKey] || '1', 10);

        topics.push({
            topic: getTopicForChannel(channel),
            numPartitions: partitions,
            replicationFactor: 1
        });

        logger.info(`Configured topic: ${getTopicForChannel(channel)} (${partitions} partitions)`);
    }

    return topics;
};


export const createTopics = async (topics: ITopicConfig[]) => {
    const admin = kafka.admin();

    try {
        await admin.connect();
        logger.info('Admin connected to Kafka');
        const existingTopics = await admin.listTopics();

        // Check for partition mismatches on existing topics
        const existingTopicsToCheck = topics.filter(
            topic => existingTopics.includes(topic.topic)
        );

        if (existingTopicsToCheck.length > 0) {
            const metadata = await admin.fetchTopicMetadata({
                topics: existingTopicsToCheck.map(t => t.topic)
            });

            for (const topicMetadata of metadata.topics) {
                const configuredTopic = topics.find(t => t.topic === topicMetadata.name);
                if (configuredTopic && configuredTopic.numPartitions !== undefined) {
                    const currentPartitions = topicMetadata.partitions.length;
                    const desiredPartitions = configuredTopic.numPartitions;

                    if (currentPartitions !== desiredPartitions) {
                        logger.info(
                            `Topic "${topicMetadata.name}" has ${currentPartitions} partitions but ${desiredPartitions} is configured. ` +
                            `Partition count cannot be changed after creation. Delete and recreate the topic to apply changes.`
                        );
                    }
                }
            }
        }

        const topicsToCreate = topics.filter(
            topic => !existingTopics.includes(topic.topic)
        );
        if (topicsToCreate.length === 0) {
            logger.info('All topics already exist');
            return;
        }
        await admin.createTopics({
            topics: topicsToCreate,
            validateOnly: false,
            timeout: 30000
        });
        logger.info(`Created topics: ${topicsToCreate.map(t => t.topic).join(', ')}`);
    } catch (err) {
        logger.error('Error creating topics:', err);
        throw err;
    } finally {
        await admin.disconnect();
    }
};

