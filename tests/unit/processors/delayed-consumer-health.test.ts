import { beforeEach, describe, expect, it, vi } from 'vitest';

const eventListeners: Record<string, ((event: unknown) => void)[]> = {};

const kafkaConsumerMock = {
    connect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    run: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    commitOffsets: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockImplementation((event: string, listener: (e: unknown) => void) => {
        if (!eventListeners[event]) {
            eventListeners[event] = [];
        }
        eventListeners[event].push(listener);
    }),
    events: {
        CRASH: 'consumer.crash',
        HEARTBEAT: 'consumer.heartbeat',
        STOP: 'consumer.stop',
        DISCONNECT: 'consumer.disconnect',
        CONNECT: 'consumer.connect',
    },
};

vi.mock('@src/config/kafka.config.js', () => ({
    kafka: {
        consumer: vi.fn(() => kafkaConsumerMock),
    },
}));

vi.mock('@src/processors/delayed/delayed.queue.js', () => ({
    addToDelayedQueue: vi.fn().mockResolvedValue(undefined),
}));

describe('Delayed Consumer Health Checks', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        for (const key of Object.keys(eventListeners)) {
            delete eventListeners[key];
        }
    });

    it('should report unhealthy when consumer is not started', async () => {
        const { isDelayedConsumerHealthy } = await import('@src/processors/delayed/delayed.consumer.js');
        expect(isDelayedConsumerHealthy()).toBe(false);
    });

    it('should report healthy once consumer starts', async () => {
        const { startDelayedConsumer, isDelayedConsumerHealthy, stopDelayedConsumer } = await import(
            '@src/processors/delayed/delayed.consumer.js'
        );

        await startDelayedConsumer();
        expect(isDelayedConsumerHealthy()).toBe(true);

        await stopDelayedConsumer();
        expect(isDelayedConsumerHealthy()).toBe(false);
    });

    it('should report unhealthy if consumer crashes', async () => {
        const { startDelayedConsumer, isDelayedConsumerHealthy, stopDelayedConsumer } = await import(
            '@src/processors/delayed/delayed.consumer.js'
        );

        await startDelayedConsumer();
        expect(isDelayedConsumerHealthy()).toBe(true);

        // Emit crash event
        const crashHandlers = eventListeners['consumer.crash'] || [];
        for (const handler of crashHandlers) {
            handler({ payload: { error: new Error('Broker disconnected') } });
        }

        expect(isDelayedConsumerHealthy()).toBe(false);

        await stopDelayedConsumer();
    });

    it('should report unhealthy if heartbeat is stale', async () => {
        const { startDelayedConsumer, isDelayedConsumerHealthy, stopDelayedConsumer } = await import(
            '@src/processors/delayed/delayed.consumer.js'
        );

        await startDelayedConsumer();
        // With negative allowance, immediately considered stale
        expect(isDelayedConsumerHealthy(-1)).toBe(false);

        await stopDelayedConsumer();
    });
});
