import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: {
            '@src': path.resolve(__dirname, './src'),
            '@tests': path.resolve(__dirname, './tests'),
        },
    },
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./tests/setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov', 'html'],
            exclude: [
                'node_modules',
                'dist',
                'dashboard',
                'tests',
                '**/*.d.ts',
                'vitest.config.ts',
            ],
            thresholds: {
                lines: 70,
                functions: 70,
                branches: 60,
                statements: 70,
            },
        },
        include: ['tests/**/*.test.ts'],
        testTimeout: 30000,
        hookTimeout: 60000, // Increase hook timeout for devcontainer environments
        // Ensure proper isolation of tests
        isolate: true,
        pool: 'forks',
    },
});
