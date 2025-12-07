/**
 * Kafka Mock Utilities
 * Provides mock Kafka producer and consumer for unit testing
 */
import { vi, type Mock } from 'vitest';

/**
 * Mock Kafka message structure
 */
export interface MockKafkaMessage {
    topic: string;
    messages: Array<{
        key?: string;
        value: string;
    }>;
}

// Store for published messages
let publishedMessages: MockKafkaMessage[] = [];

/**
 * Create a mock Kafka producer
 */
export const createMockKafkaProducer = () => {
    return {
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        send: vi.fn(async (record: MockKafkaMessage) => {
            publishedMessages.push(record);
            return [{ topicName: record.topic, partition: 0, errorCode: 0 }];
        }),
        sendBatch: vi.fn().mockResolvedValue([]),
    };
};

/**
 * Create a mock Kafka consumer
 */
export const createMockKafkaConsumer = () => {
    const messageHandlers: Map<string, Function> = new Map();

    return {
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn().mockResolvedValue(undefined),
        run: vi.fn(async ({ eachMessage }) => {
            messageHandlers.set('eachMessage', eachMessage);
        }),
        pause: vi.fn(),
        resume: vi.fn(),
        stop: vi.fn().mockResolvedValue(undefined),

        // Helper to simulate receiving a message
        __simulateMessage: async (topic: string, partition: number, message: { key?: string; value: string }) => {
            const handler = messageHandlers.get('eachMessage');
            if (handler) {
                await handler({
                    topic,
                    partition,
                    message: {
                        key: message.key ? Buffer.from(message.key) : null,
                        value: Buffer.from(message.value),
                        offset: '0',
                        timestamp: Date.now().toString(),
                    },
                });
            }
        },
    };
};

/**
 * Create a mock Kafka admin client
 */
export const createMockKafkaAdmin = () => {
    return {
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        listTopics: vi.fn().mockResolvedValue([]),
        createTopics: vi.fn().mockResolvedValue(true),
        fetchTopicMetadata: vi.fn().mockResolvedValue({ topics: [] }),
    };
};

/**
 * Create a mock Kafka instance
 */
export const createMockKafka = () => {
    const producer = createMockKafkaProducer();
    const consumer = createMockKafkaConsumer();
    const admin = createMockKafkaAdmin();

    return {
        producer: vi.fn(() => producer),
        consumer: vi.fn(() => consumer),
        admin: vi.fn(() => admin),

        // Expose internal mocks for testing
        __producer: producer,
        __consumer: consumer,
        __admin: admin,
    };
};

/**
 * Get all messages published during tests
 */
export const getPublishedMessages = (): MockKafkaMessage[] => {
    return [...publishedMessages];
};

/**
 * Get messages published to a specific topic
 */
export const getMessagesForTopic = (topic: string): MockKafkaMessage[] => {
    return publishedMessages.filter(m => m.topic === topic);
};

/**
 * Clear all published messages
 */
export const clearPublishedMessages = (): void => {
    publishedMessages = [];
};

/**
 * Create a mock for the kafka.config module
 */
export const createKafkaConfigMock = () => {
    const mockKafka = createMockKafka();

    return {
        kafka: mockKafka,
        createTopics: vi.fn().mockResolvedValue(undefined),
    };
};
