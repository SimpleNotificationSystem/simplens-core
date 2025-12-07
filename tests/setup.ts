/**
 * Global test setup file
 * Configures test environment with isolated mocks
 */
import { beforeAll, afterAll, afterEach, vi } from 'vitest';
import dotenv from 'dotenv';

// Load test environment
dotenv.config({ path: '.env.test' });

// Store original console methods
const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
};

// Suppress console output during tests for cleaner output
// Set TEST_VERBOSE=true to see logs
beforeAll(() => {
    if (process.env.TEST_VERBOSE !== 'true') {
        vi.spyOn(console, 'log').mockImplementation(() => { });
        vi.spyOn(console, 'info').mockImplementation(() => { });
    }
});

afterAll(() => {
    vi.restoreAllMocks();
});

// Clear all mocks after each test
afterEach(() => {
    vi.clearAllMocks();
});
