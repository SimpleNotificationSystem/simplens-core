import { Kafka, ITopicConfig } from "kafkajs";
import { env } from "./env.config.js";
import { producerLogger as logger } from "@src/workers/utils/logger.js";
import { getConfiguredChannels } from '@src/plugins/index.js';
import { getTopicForChannel, CORE_TOPICS } from '@src/types/types.js';
import { AdminAlertService } from '@src/admin-alerts/admin-alert.service.js';

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

/**
 * Build Kafka topics dynamically from MongoDB channel routing records
 */
export const buildKafkaTopicsFromDatabase = async (): Promise<ITopicConfig[]> => {
    const topics: ITopicConfig[] = [
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

    try {
        const ChannelRouting = (await import('@src/database/models/channel-routing.models.js')).default;
        const routings = await ChannelRouting.find().lean();
        if (routings && routings.length > 0) {
            for (const r of routings) {
                topics.push({
                    topic: getTopicForChannel(r.channel),
                    numPartitions: r.partitions || 6,
                    replicationFactor: 1,
                });
                logger.info(`Configured topic from DB: ${getTopicForChannel(r.channel)} (${r.partitions || 6} partitions)`);
            }
            return topics;
        }
    } catch (err) {
        logger.warn('Could not query ChannelRouting for Kafka topics, falling back to static config:', {
            error: err instanceof Error ? err.message : String(err)
        });
    }

    return buildKafkaTopics();
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

                    if (desiredPartitions > currentPartitions) {
                        logger.info(`Expanding topic "${topicMetadata.name}" from ${currentPartitions} to ${desiredPartitions} partitions...`);
                        await admin.createPartitions({
                            topicPartitions: [{
                                topic: topicMetadata.name,
                                count: desiredPartitions
                            }]
                        });
                        logger.success(`Successfully expanded topic "${topicMetadata.name}" to ${desiredPartitions} partitions`);
                    } else if (desiredPartitions < currentPartitions) {
                        logger.info(
                            `Topic "${topicMetadata.name}" has ${currentPartitions} partitions (configured: ${desiredPartitions}). ` +
                            `Kafka partition count cannot be decreased.`
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

        void AdminAlertService.sendAlert('service_health',
            `🔴 KAFKA TOPIC CREATION FAILED\n` +
            `Error: ${err instanceof Error ? err.message : 'Unknown error'}\n` +
            `Brokers: ${env.BROKERS.join(', ')}\n` +
            `Action: Verify Kafka brokers are running. Check network connectivity. Review broker logs.`,
            { severity: 'critical' });

        throw err;
    } finally {
        await admin.disconnect();
    }
};

/**
 * Dynamically expand partition count for a channel topic
 */
export const expandTopicPartitions = async (
    channel: string,
    desiredPartitions: number
): Promise<{ previous: number; current: number }> => {
    const admin = kafka.admin();
    const topic = getTopicForChannel(channel);

    try {
        await admin.connect();
        const metadata = await admin.fetchTopicMetadata({ topics: [topic] });
        const topicMetadata = metadata.topics.find(t => t.name === topic);

        if (!topicMetadata) {
            throw new Error(`Topic '${topic}' for channel '${channel}' not found in Kafka`);
        }

        const currentPartitions = topicMetadata.partitions.length;

        if (desiredPartitions < currentPartitions) {
            throw new Error(
                `Kafka partition count cannot be decreased. Current count is ${currentPartitions}, requested ${desiredPartitions}.`
            );
        }

        if (desiredPartitions > currentPartitions) {
            logger.info(`Expanding Kafka topic '${topic}' from ${currentPartitions} to ${desiredPartitions} partitions...`);
            await admin.createPartitions({
                topicPartitions: [{
                    topic,
                    count: desiredPartitions
                }]
            });
            logger.success(`Expanded Kafka topic '${topic}' to ${desiredPartitions} partitions`);
            return { previous: currentPartitions, current: desiredPartitions };
        }

        return { previous: currentPartitions, current: currentPartitions };
    } finally {
        await admin.disconnect();
    }
};

