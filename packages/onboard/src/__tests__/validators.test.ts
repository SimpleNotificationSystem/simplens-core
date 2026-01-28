import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
    checkDockerInstalled, 
    checkDockerRunning,
    detectOS,
    validatePrerequisites,
    validateEnvValue
} from '../validators.js';
import {
    DockerNotInstalledError,
    DockerNotRunningError,
    DockerPermissionError
} from '../types/errors.js';

// Mock execa
vi.mock('execa', () => ({
    execa: vi.fn(),
}));

// Mock utils
vi.mock('../utils.js', () => ({
    logError: vi.fn(),
    logSuccess: vi.fn(),
    logWarning: vi.fn(),
}));

import { execa } from 'execa';

describe('validators', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('checkDockerInstalled', () => {
        it('should not throw when docker is installed', async () => {
            vi.mocked(execa).mockResolvedValueOnce({
                stdout: 'Docker version 24.0.0',
                stderr: '',
            } as any);

            await expect(checkDockerInstalled()).resolves.not.toThrow();
        });

        it('should throw DockerNotInstalledError when docker is not installed', async () => {
            vi.mocked(execa).mockRejectedValueOnce(new Error('Command not found'));

            await expect(checkDockerInstalled()).rejects.toThrow(DockerNotInstalledError);
        });
    });

    describe('checkDockerRunning', () => {
        it('should not throw when docker daemon is running', async () => {
            vi.mocked(execa).mockResolvedValueOnce({
                stdout: 'CONTAINER ID   IMAGE',
                stderr: '',
            } as any);

            await expect(checkDockerRunning()).resolves.not.toThrow();
        });

        it('should throw DockerPermissionError on permission denied', async () => {
            const error = new Error('permission denied while trying to connect');
            vi.mocked(execa).mockRejectedValueOnce(error);

            await expect(checkDockerRunning()).rejects.toThrow(DockerPermissionError);
        });

        it('should throw DockerNotRunningError when daemon is not running', async () => {
            const error = new Error('Cannot connect to the Docker daemon');
            vi.mocked(execa).mockRejectedValueOnce(error);

            await expect(checkDockerRunning()).rejects.toThrow(DockerNotRunningError);
        });

        it('should throw DockerNotRunningError on generic docker error', async () => {
            const error = new Error('Some other docker error');
            vi.mocked(execa).mockRejectedValueOnce(error);

            await expect(checkDockerRunning()).rejects.toThrow(DockerNotRunningError);
        });
    });

    describe('detectOS', () => {
        const originalPlatform = process.platform;

        afterEach(() => {
            Object.defineProperty(process, 'platform', {
                value: originalPlatform
            });
        });

        it('should detect Windows', () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32'
            });
            expect(detectOS()).toBe('windows');
        });

        it('should detect macOS', () => {
            Object.defineProperty(process, 'platform', {
                value: 'darwin'
            });
            expect(detectOS()).toBe('darwin');
        });

        it('should detect Linux', () => {
            Object.defineProperty(process, 'platform', {
                value: 'linux'
            });
            expect(detectOS()).toBe('linux');
        });

        it('should default to Linux for unknown platforms', () => {
            Object.defineProperty(process, 'platform', {
                value: 'freebsd'
            });
            expect(detectOS()).toBe('linux');
        });
    });

    describe('validateEnvValue', () => {
        describe('URL validation', () => {
            it('should reject empty MongoDB URI', () => {
                expect(validateEnvValue('MONGO_URI', '')).toBe(false);
            });

            it('should reject MongoDB URI without proper format', () => {
                expect(validateEnvValue('MONGO_URI', 'localhost:27017')).toBe(false);
            });

            it('should accept valid MongoDB URI', () => {
                expect(validateEnvValue('MONGO_URI', 'mongodb://localhost:27017')).toBe(true);
            });

            it('should reject Redis URL without proper format', () => {
                expect(validateEnvValue('REDIS_URL', 'localhost:6379')).toBe(false);
            });

            it('should accept valid Redis URL', () => {
                expect(validateEnvValue('REDIS_URL', 'redis://localhost:6379')).toBe(true);
            });
        });

        describe('Port validation', () => {
            it('should reject negative ports', () => {
                expect(validateEnvValue('PORT', '-1')).toBe(false);
            });

            it('should reject zero port', () => {
                expect(validateEnvValue('PORT', '0')).toBe(false);
            });

            it('should reject ports > 65535', () => {
                expect(validateEnvValue('PORT', '65536')).toBe(false);
            });

            it('should accept valid ports', () => {
                expect(validateEnvValue('PORT', '3000')).toBe(true);
                expect(validateEnvValue('API_PORT', '8080')).toBe(true);
            });

            it('should reject non-numeric ports', () => {
                expect(validateEnvValue('PORT', 'abc')).toBe(false);
            });
        });

        describe('Security fields validation', () => {
            it('should reject short API keys', () => {
                expect(validateEnvValue('API_KEY', 'short')).toBe(false);
            });

            it('should reject short passwords', () => {
                expect(validateEnvValue('PASSWORD', '1234567')).toBe(false);
            });

            it('should reject short secrets', () => {
                expect(validateEnvValue('AUTH_SECRET', 'abc')).toBe(false);
            });

            it('should accept API keys with 8+ characters', () => {
                expect(validateEnvValue('API_KEY', 'verylongapikey123')).toBe(true);
            });

            it('should accept passwords with 8+ characters', () => {
                expect(validateEnvValue('PASSWORD', 'password123')).toBe(true);
            });
        });

        describe('General validation', () => {
            it('should accept valid non-special values', () => {
                expect(validateEnvValue('SOME_VAR', 'some-value')).toBe(true);
            });
        });
    });
});
