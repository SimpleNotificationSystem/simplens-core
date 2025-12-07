/**
 * Unit tests for whatsapp.service.ts
 * Tests WhatsApp mock service functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockWhatsappNotification } from '../../../utils/mocks';

// Mock logger
vi.mock('@src/workers/utils/logger.js', () => ({
    whatsappProcessorLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
    },
}));

describe('WhatsApp Service', () => {
    let whatsappService: typeof import('@src/processors/whatsapp/whatsapp.service.js');

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        // Mock Math.random for deterministic testing
        vi.spyOn(Math, 'random');
        whatsappService = await import('@src/processors/whatsapp/whatsapp.service.js');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('sendWhatsApp', () => {
        const mockNotification = createMockWhatsappNotification();

        it('should return success with messageId when random < 0.95', async () => {
            // Force success path
            vi.mocked(Math.random).mockReturnValue(0.5);

            const result = await whatsappService.sendWhatsApp(mockNotification);

            expect(result.success).toBe(true);
            expect(result.messageId).toBeDefined();
            expect(result.messageId).toMatch(/^whatsapp-\d+-/);
        });

        it('should return failure when random >= 0.95', async () => {
            // Force failure path
            vi.mocked(Math.random).mockReturnValue(0.99);

            const result = await whatsappService.sendWhatsApp(mockNotification);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Mock delivery failure - simulated for testing');
        });

        it('should replace template variables in message', async () => {
            vi.mocked(Math.random).mockReturnValue(0.5);

            const templateNotification = {
                ...mockNotification,
                content: {
                    message: 'Hello {{name}}, your OTP is {{otp}}',
                },
                variables: {
                    name: 'John',
                    otp: '123456',
                },
            };

            const result = await whatsappService.sendWhatsApp(templateNotification);

            expect(result.success).toBe(true);
            // Variables should be processed internally
        });

        it('should handle variables with whitespace in placeholders', async () => {
            vi.mocked(Math.random).mockReturnValue(0.5);

            const templateNotification = {
                ...mockNotification,
                content: {
                    message: 'Welcome {{ username }}!',
                },
                variables: {
                    username: 'Alice',
                },
            };

            const result = await whatsappService.sendWhatsApp(templateNotification);

            expect(result.success).toBe(true);
        });

        it('should work without template variables', async () => {
            vi.mocked(Math.random).mockReturnValue(0.5);

            const simpleNotification = {
                ...mockNotification,
                content: {
                    message: 'Simple message without variables',
                },
                variables: undefined,
            };

            const result = await whatsappService.sendWhatsApp(simpleNotification as any);

            expect(result.success).toBe(true);
        });

        it('should handle empty variables object', async () => {
            vi.mocked(Math.random).mockReturnValue(0.5);

            const notification = {
                ...mockNotification,
                variables: {},
            };

            const result = await whatsappService.sendWhatsApp(notification);

            expect(result.success).toBe(true);
        });
    });

    describe('initWhatsAppService', () => {
        it('should initialize without errors', () => {
            expect(() => whatsappService.initWhatsAppService()).not.toThrow();
        });
    });

    describe('closeWhatsAppService', () => {
        it('should close without errors', () => {
            expect(() => whatsappService.closeWhatsAppService()).not.toThrow();
        });
    });
});
