import { Kafka, Admin, ITopicConfig } from "kafkajs";
import { env } from "./env.config.js";
import { producerLogger as logger } from "@src/workers/utils/logger.js";

export const kafka = new Kafka({
    clientId: "notification-service",
    brokers: env.BROKERS
});

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

