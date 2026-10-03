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

vi.mock('@src/database/models/notification.models.js', () => ({
    default: {
        findByIdAndUpdate: vi.fn(),
    },
}));

describe('Status Consumer Health Checks', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        for (const key of Object.keys(eventListeners)) {
            delete eventListeners[key];
        }
    });

    it('should report unhealthy when consumer is not started', async () => {
        const { isStatusConsumerHealthy } = await import('@src/workers/consumers/status.consumer.js');
        expect(isStatusConsumerHealthy()).toBe(false);
    });

    it('should report healthy once consumer starts', async () => {
        const { startStatusConsumer, isStatusConsumerHealthy, stopStatusConsumer } = await import(
            '@src/workers/consumers/status.consumer.js'
        );

        await startStatusConsumer();
        expect(isStatusConsumerHealthy()).toBe(true);

        await stopStatusConsumer();
        expect(isStatusConsumerHealthy()).toBe(false);
    });

    it('should report unhealthy if consumer crashes', async () => {
        const { startStatusConsumer, isStatusConsumerHealthy, stopStatusConsumer } = await import(
            '@src/workers/consumers/status.consumer.js'
        );

        await startStatusConsumer();
        expect(isStatusConsumerHealthy()).toBe(true);

        // Emit crash event
        const crashHandlers = eventListeners['consumer.crash'] || [];
        for (const handler of crashHandlers) {
            handler({ payload: { error: new Error('Broker disconnected') } });
        }

        expect(isStatusConsumerHealthy()).toBe(false);

        await stopStatusConsumer();
    });

    it('should report unhealthy if heartbeat is stale', async () => {
        const { startStatusConsumer, isStatusConsumerHealthy, stopStatusConsumer } = await import(
            '@src/workers/consumers/status.consumer.js'
        );

        await startStatusConsumer();
        // With threshold of 0ms, heartbeat is immediately considered stale if checked with negative/0 allowance
        expect(isStatusConsumerHealthy(-1)).toBe(false);

        await stopStatusConsumer();
    });
});
