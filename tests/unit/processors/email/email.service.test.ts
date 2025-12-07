/**
 * Unit tests for email.service.ts
 * Tests email sending functionality with mocked nodemailer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockEmailNotification } from '../../../utils/mocks.js';

// Create mock functions before the vi.mock call
const mockSendMail = vi.fn();
const mockVerify = vi.fn();
const mockClose = vi.fn();

const mockTransporter = {
    sendMail: mockSendMail,
    verify: mockVerify,
    close: mockClose,
};

const mockCreateTransport = vi.fn(() => mockTransporter);

// Mock nodemailer before importing the module
vi.mock('nodemailer', () => ({
    default: {
        createTransport: mockCreateTransport,
    },
}));

// Mock logger
vi.mock('@src/workers/utils/logger.js', () => ({
    emailProcessorLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
    },
}));

// Mock env config
vi.mock('@src/config/env.config.js', () => ({
    env: {
        EMAIL_USER: 'test@example.com',
        EMAIL_PASS: 'test-password',
        EMAIL_HOST: 'smtp.example.com',
        EMAIL_PORT: 587,
        EMAIL_FROM: 'noreply@example.com',
    },
}));

describe('Email Service', () => {
    let emailService: typeof import('../../../../src/processors/email/email.service.js');

    beforeEach(async () => {
        vi.clearAllMocks();
        // Reset module to clear transporter state
        vi.resetModules();
        emailService = await import('../../../../src/processors/email/email.service.js');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('initEmailTransporter', () => {
        it('should initialize transporter with correct config', () => {
            emailService.initEmailTransporter();

            expect(mockCreateTransport).toHaveBeenCalledWith(
                expect.objectContaining({
                    host: 'smtp.example.com',
                    port: 587,
                    auth: {
                        user: 'test@example.com',
                        pass: 'test-password',
                    },
                })
            );
        });

        it('should be idempotent - only initialize once', () => {
            emailService.initEmailTransporter();
            emailService.initEmailTransporter();

            expect(mockCreateTransport).toHaveBeenCalledTimes(1);
        });
    });

    describe('verifyEmailTransporter', () => {
        it('should return true on successful verification', async () => {
            mockVerify.mockResolvedValue(true);

            const result = await emailService.verifyEmailTransporter();

            expect(result).toBe(true);
            expect(mockVerify).toHaveBeenCalled();
        });

        it('should return false on verification failure', async () => {
            mockVerify.mockRejectedValue(new Error('Connection failed'));

            const result = await emailService.verifyEmailTransporter();

            expect(result).toBe(false);
        });

        it('should initialize transporter if not already initialized', async () => {
            mockVerify.mockResolvedValue(true);

            await emailService.verifyEmailTransporter();

            expect(mockCreateTransport).toHaveBeenCalled();
        });
    });

    describe('sendEmail', () => {
        const mockNotification = createMockEmailNotification();

        beforeEach(() => {
            mockSendMail.mockResolvedValue({ messageId: 'test-message-id-123' });
        });

        it('should send email successfully and return messageId', async () => {
            const result = await emailService.sendEmail(mockNotification);

            expect(result.success).toBe(true);
            expect(result.messageId).toBe('test-message-id-123');
            expect(mockSendMail).toHaveBeenCalled();
        });

        it('should send plain text email for non-HTML content', async () => {
            const plainTextNotification = {
                ...mockNotification,
                content: {
                    subject: 'Test Subject',
                    message: 'This is plain text content',
                },
            };

            await emailService.sendEmail(plainTextNotification);

            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: 'This is plain text content',
                })
            );
        });

        it('should send HTML email for HTML content', async () => {
            const htmlNotification = {
                ...mockNotification,
                content: {
                    subject: 'Test Subject',
                    message: '<html><body><h1>Hello</h1></body></html>',
                },
            };

            await emailService.sendEmail(htmlNotification);

            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    html: '<html><body><h1>Hello</h1></body></html>',
                })
            );
        });

        it('should replace template variables in message', async () => {
            const templateNotification = {
                ...mockNotification,
                content: {
                    subject: 'Test Subject',
                    message: 'Hello {{name}}, your code is {{code}}',
                },
                variables: {
                    name: 'John',
                    code: '12345',
                },
            };

            await emailService.sendEmail(templateNotification);

            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: 'Hello John, your code is 12345',
                })
            );
        });

        it('should handle template variables with extra whitespace', async () => {
            const templateNotification = {
                ...mockNotification,
                content: {
                    subject: 'Test',
                    message: 'Hello {{ name }}, welcome!',
                },
                variables: {
                    name: 'Jane',
                },
            };

            await emailService.sendEmail(templateNotification);

            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: 'Hello Jane, welcome!',
                })
            );
        });

        it('should use correct from address', async () => {
            await emailService.sendEmail(mockNotification);

            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    from: 'noreply@example.com',
                })
            );
        });

        it('should return error on send failure', async () => {
            mockSendMail.mockRejectedValue(new Error('SMTP connection failed'));

            const result = await emailService.sendEmail(mockNotification);

            expect(result.success).toBe(false);
            expect(result.error).toBe('SMTP connection failed');
        });

        it('should handle unknown errors gracefully', async () => {
            mockSendMail.mockRejectedValue('Unknown error');

            const result = await emailService.sendEmail(mockNotification);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Unknown error');
        });
    });

    describe('closeEmailTransporter', () => {
        it('should close transporter when initialized', async () => {
            // Initialize first
            emailService.initEmailTransporter();

            emailService.closeEmailTransporter();

            expect(mockClose).toHaveBeenCalled();
        });

        it('should be safe to call when not initialized', () => {
            // Should not throw
            expect(() => emailService.closeEmailTransporter()).not.toThrow();
        });
    });
});
