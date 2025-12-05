import { Kafka, Admin, ITopicConfig} from "kafkajs";
import { env } from "./env.config.js";

export const kafka = new Kafka({
    clientId: "notification-service",
    brokers: env.BROKERS 
});

export const createTopics = async (topics: ITopicConfig[]) => {
    const admin = kafka.admin();
    
    try {
        await admin.connect();
        console.log('Admin connected to Kafka');
        const existingTopics = await admin.listTopics();
        const topicsToCreate = topics.filter(
            topic => !existingTopics.includes(topic.topic)
        );
        if (topicsToCreate.length === 0) {
            console.log('All topics already exist');
            return;
        }
        await admin.createTopics({
            topics: topicsToCreate,
            validateOnly: false,
            timeout: 30000
        });
        console.log(`Created topics: ${topicsToCreate.map(t => t.topic).join(', ')}`);
    } catch (err) {
        console.error('Error creating topics:', err);
        throw err;
    } finally {
        await admin.disconnect();
    }
};

