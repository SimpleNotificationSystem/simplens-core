/**
 * Redis Mock Utilities
 * Provides a mock Redis client for unit testing without actual Redis connection
 */
import Redis from 'ioredis-mock';
import { vi } from 'vitest';

// Type for the mock Redis instance
type RedisMockInstance = InstanceType<typeof Redis>;

// Store for mock data
let mockRedisData: Map<string, string> = new Map();
let mockRedisInstance: RedisMockInstance | null = null;

/**
 * Create a mock Redis client
 * Uses ioredis-mock for realistic behavior without network calls
 */
export const createMockRedis = (): RedisMockInstance => {
    mockRedisInstance = new Redis();
    return mockRedisInstance;
};

/**
 * Get the current mock Redis instance
 */
export const getMockRedis = (): RedisMockInstance | null => {
    return mockRedisInstance;
};

/**
 * Clear all data from the mock Redis
 */
export const clearMockRedis = async (): Promise<void> => {
    if (mockRedisInstance) {
        await mockRedisInstance.flushall();
    }
    mockRedisData.clear();
};

/**
 * Reset the mock Redis instance
 */
export const resetMockRedis = (): void => {
    mockRedisInstance = null;
    mockRedisData.clear();
};

/**
 * Create a mock for the redis.config module
 * Returns functions that use the mock Redis client
 */
export const createRedisConfigMock = () => {
    const mockClient = createMockRedis();

    return {
        getRedisClient: vi.fn(() => mockClient),
        connectRedis: vi.fn(async () => mockClient),
        disconnectRedis: vi.fn(async () => { }),
        isRedisHealthy: vi.fn(async () => true),
        redis: mockClient,
    };
};

/**
 * Manually set a value in mock Redis (for test setup)
 */
export const setMockRedisValue = async (
    key: string,
    value: string
): Promise<void> => {
    if (mockRedisInstance) {
        await mockRedisInstance.set(key, value);
    }
    mockRedisData.set(key, value);
};

/**
 * Manually get a value from mock Redis (for test verification)
 */
export const getMockRedisValue = async (
    key: string
): Promise<string | null> => {
    if (mockRedisInstance) {
        return mockRedisInstance.get(key);
    }
    return mockRedisData.get(key) || null;
};
