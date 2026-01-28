import { describe, it, expect } from 'vitest';
import {
    OnboardingError,
    DockerNotInstalledError,
    DockerNotRunningError,
    DockerPermissionError,
    DockerComposeError,
    FileSystemError,
    DirectoryNotWritableError,
    isOnboardingError,
    formatErrorForUser,
} from '../types/errors.js';

describe('error types', () => {
    describe('OnboardingError', () => {
        it('should create error with code and message', () => {
            const error = new OnboardingError('TEST_CODE', 'Test message');

            expect(error.code).toBe('TEST_CODE');
            expect(error.message).toBe('Test message');
            expect(error.name).toBe('OnboardingError');
        });

        it('should include troubleshooting when provided', () => {
            const error = new OnboardingError(
                'TEST_CODE',
                'Test message',
                'Try this fix'
            );

            expect(error.troubleshooting).toBe('Try this fix');
        });

        it('should have proper stack trace', () => {
            const error = new OnboardingError('TEST', 'message');

            expect(error.stack).toBeDefined();
            expect(error.stack).toContain('OnboardingError');
        });
    });

    describe('DockerNotInstalledError', () => {
        it('should have correct message and troubleshooting', () => {
            const error = new DockerNotInstalledError();

            expect(error.message).toContain('not installed');
            expect(error.troubleshooting).toContain('https://docs.docker.com/get-docker/');
            expect(error.name).toBe('DockerNotInstalledError');
        });
    });

    describe('DockerNotRunningError', () => {
        it('should have correct message and troubleshooting', () => {
            const error = new DockerNotRunningError();

            expect(error.message).toContain('not running');
            expect(error.troubleshooting).toContain('Docker daemon');
            expect(error.name).toBe('DockerNotRunningError');
        });
    });

    describe('DockerPermissionError', () => {
        it('should have correct message and troubleshooting', () => {
            const error = new DockerPermissionError();

            expect(error.message).toContain('Permission denied');
            expect(error.troubleshooting).toContain('usermod');
            expect(error.name).toBe('DockerPermissionError');
        });
    });

    describe('DockerComposeError', () => {
        it('should include operation in message', () => {
            const error = new DockerComposeError('start services');

            expect(error.message).toContain('start services');
            expect(error.name).toBe('DockerComposeError');
        });

        it('should use custom troubleshooting when provided', () => {
            const error = new DockerComposeError('pull images', 'Check network connection');

            expect(error.troubleshooting).toBe('Check network connection');
        });

        it('should have default troubleshooting', () => {
            const error = new DockerComposeError('operation');

            expect(error.troubleshooting).toContain('docker-compose logs');
        });
    });

    describe('FileSystemError', () => {
        it('should include path in error', () => {
            const error = new FileSystemError(
                'Cannot write',
                '/path/to/file',
                'Check permissions'
            );

            expect(error.path).toBe('/path/to/file');
            expect(error.troubleshooting).toBe('Check permissions');
        });
    });

    describe('DirectoryNotWritableError', () => {
        it('should include path in message and error', () => {
            const error = new DirectoryNotWritableError('/opt/app');

            expect(error.message).toContain('/opt/app');
            expect(error.path).toBe('/opt/app');
            expect(error.troubleshooting).toContain('permissions');
        });
    });

    describe('isOnboardingError', () => {
        it('should return true for OnboardingError instances', () => {
            const error = new OnboardingError('CODE', 'message');

            expect(isOnboardingError(error)).toBe(true);
        });

        it('should return true for subclasses of OnboardingError', () => {
            const error = new DockerNotInstalledError();

            expect(isOnboardingError(error)).toBe(true);
        });

        it('should return false for regular Error', () => {
            const error = new Error('regular error');

            expect(isOnboardingError(error)).toBe(false);
        });

        it('should return false for non-error values', () => {
            expect(isOnboardingError('string')).toBe(false);
            expect(isOnboardingError(null)).toBe(false);
            expect(isOnboardingError(undefined)).toBe(false);
            expect(isOnboardingError({})).toBe(false);
        });
    });

    describe('formatErrorForUser', () => {
        it('should format OnboardingError with troubleshooting', () => {
            const error = new OnboardingError(
                'TEST',
                'Something went wrong',
                'Try this fix'
            );

            const formatted = formatErrorForUser(error);

            expect(formatted).toContain('❌ Something went wrong');
            expect(formatted).toContain('💡 Troubleshooting:');
            expect(formatted).toContain('Try this fix');
        });

        it('should format OnboardingError without troubleshooting', () => {
            const error = new OnboardingError('TEST', 'Something went wrong');

            const formatted = formatErrorForUser(error);

            expect(formatted).toBe('❌ Something went wrong');
            expect(formatted).not.toContain('Troubleshooting');
        });

        it('should format regular Error', () => {
            const error = new Error('Regular error message');

            const formatted = formatErrorForUser(error);

            expect(formatted).toContain('Unexpected error');
            expect(formatted).toContain('Regular error message');
        });

        it('should handle non-Error values', () => {
            const formatted = formatErrorForUser('some string');

            expect(formatted).toBe('❌ An unknown error occurred');
        });

        it('should handle null/undefined', () => {
            expect(formatErrorForUser(null)).toBe('❌ An unknown error occurred');
            expect(formatErrorForUser(undefined)).toBe('❌ An unknown error occurred');
        });
    });
});
