import { Kafka, Admin, ITopicConfig} from "kafkajs";
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

