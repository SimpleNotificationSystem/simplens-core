/**
 * Unit Tests for Zod Schema Validation
 * Tests all notification schemas for proper validation behavior
 * 
 * Updated for plugin-based architecture - uses dynamic channel strings.
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import {
    safeValidateNotificationRequest,
    safeValidateBatchNotificationRequest,
    safeValidateBaseNotification,
    safeValidateNotification,
    safeValidateOutbox,
} from '../../../src/types/schemas.js';
import { NOTIFICATION_STATUS, OUTBOX_STATUS, getTopicForChannel } from '../../../src/types/types.js';

describe('Notification Request Schema', () => {
    describe('safeValidateNotificationRequest', () => {
        it('should validate a valid email notification request', () => {
            const validRequest = {
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: ['email'],
                recipient: {
                    user_id: 'user-123',
                    email: 'test@example.com',
                },
                content: {
                    email: {
                        subject: 'Test Subject',
                        message: 'Test message body',
                    },
                },
                webhook_url: 'https://webhook.example.com/callback',
            };

            const result = safeValidateNotificationRequest(validRequest);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.request_id).toBe(validRequest.request_id);
                expect(result.data.channel).toEqual(['email']);
            }
        });

        it('should validate a valid whatsapp notification request', () => {
            const validRequest = {
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: ['whatsapp'],
                recipient: {
                    user_id: 'user-123',
                    phone: '+1234567890',
                },
                content: {
                    whatsapp: {
                        message: 'Test WhatsApp message',
                    },
                },
                webhook_url: 'https://webhook.example.com/callback',
            };

            const result = safeValidateNotificationRequest(validRequest);
            expect(result.success).toBe(true);
        });

        it('should validate a multi-channel notification request', () => {
            const validRequest = {
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: ['email', 'whatsapp'],
                recipient: {
                    user_id: 'user-123',
                    email: 'test@example.com',
                    phone: '+1234567890',
                },
                content: {
                    email: {
                        subject: 'Test Subject',
                        message: 'Test email message',
                    },
                    whatsapp: {
                        message: 'Test WhatsApp message',
                    },
                },
                webhook_url: 'https://webhook.example.com/callback',
            };

            const result = safeValidateNotificationRequest(validRequest);
            expect(result.success).toBe(true);
        });


        // Note: flexibleUUIDSchema accepts more formats for plugin extensibility

        it('should fail with invalid webhook URL', () => {
            const invalidRequest = {
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: ['email'],
                recipient: {
                    user_id: 'user-123',
                    email: 'test@example.com',
                },
                content: {
                    email: {
                        subject: 'Test',
                        message: 'Test',
                    },
                },
                webhook_url: 'not-a-valid-url',
            };

            const result = safeValidateNotificationRequest(invalidRequest);
            expect(result.success).toBe(false);
        });

        it('should accept scheduled_at for delayed notifications', () => {
            const futureDate = new Date(Date.now() + 60000); // 1 minute from now
            const validRequest = {
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: ['email'],
                recipient: {
                    user_id: 'user-123',
                    email: 'test@example.com',
                },
                content: {
                    email: {
                        subject: 'Scheduled Test',
                        message: 'This is scheduled',
                    },
                },
                webhook_url: 'https://webhook.example.com/callback',
                scheduled_at: futureDate.toISOString(),
            };

            const result = safeValidateNotificationRequest(validRequest);
            expect(result.success).toBe(true);
        });

        it('should accept provider as string', () => {
            const validRequest = {
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: ['email'],
                provider: 'gmail',
                recipient: {
                    user_id: 'user-123',
                    email: 'test@example.com',
                },
                content: {
                    email: {
                        subject: 'Test',
                        message: 'Test',
                    },
                },
                webhook_url: 'https://webhook.example.com/callback',
            };

            const result = safeValidateNotificationRequest(validRequest);
            expect(result.success).toBe(true);
        });

        it('should accept provider as array matching channel length', () => {
            const validRequest = {
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: ['email', 'whatsapp'],
                provider: ['gmail', 'twilio'],
                recipient: {
                    user_id: 'user-123',
                    email: 'test@example.com',
                    phone: '+1234567890',
                },
                content: {
                    email: { subject: 'Test', message: 'Test' },
                    whatsapp: { message: 'Test' },
                },
                webhook_url: 'https://webhook.example.com/callback',
            };

            const result = safeValidateNotificationRequest(validRequest);
            expect(result.success).toBe(true);
        });
    });
});

describe('Batch Notification Request Schema', () => {
    describe('safeValidateBatchNotificationRequest', () => {
        it('should validate a valid batch notification request', () => {
            const validRequest = {
                client_id: randomUUID(),
                channel: ['email'],
                content: {
                    email: {
                        subject: 'Batch Test',
                        message: 'Hello {{name}}',
                    },
                },
                recipients: [
                    { request_id: randomUUID(), user_id: 'user-1', email: 'user1@example.com', variables: { name: 'User 1' } },
                    { request_id: randomUUID(), user_id: 'user-2', email: 'user2@example.com', variables: { name: 'User 2' } },
                ],
                webhook_url: 'https://webhook.example.com/callback',
            };

            const result = safeValidateBatchNotificationRequest(validRequest);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.recipients.length).toBe(2);
            }
        });
    });
});

describe('Base Notification Schema', () => {
    describe('safeValidateBaseNotification', () => {
        it('should validate a valid base notification', () => {
            const validNotification = {
                notification_id: new mongoose.Types.ObjectId(),
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: 'email',
                recipient: {
                    user_id: 'user-123',
                    email: 'test@example.com',
                },
                content: {
                    subject: 'Test Subject',
                    message: 'Test message body',
                },
                variables: { name: 'Test User' },
                webhook_url: 'https://webhook.example.com/callback',
                retry_count: 0,
                created_at: new Date(),
            };

            const result = safeValidateBaseNotification(validNotification);
            expect(result.success).toBe(true);
        });

        it('should validate notification with any channel string', () => {
            const validNotification = {
                notification_id: new mongoose.Types.ObjectId(),
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: 'custom-channel',
                recipient: {
                    user_id: 'user-123',
                },
                content: {
                    data: 'some data',
                },
                webhook_url: 'https://webhook.example.com/callback',
                retry_count: 0,
                created_at: new Date(),
            };

            const result = safeValidateBaseNotification(validNotification);
            expect(result.success).toBe(true);
        });

        it('should validate notification with provider field', () => {
            const validNotification = {
                notification_id: new mongoose.Types.ObjectId(),
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: 'email',
                provider: 'gmail',
                recipient: {
                    user_id: 'user-123',
                    email: 'test@example.com',
                },
                content: {
                    subject: 'Test',
                    message: 'Test',
                },
                webhook_url: 'https://webhook.example.com/callback',
                retry_count: 0,
                created_at: new Date(),
            };

            const result = safeValidateBaseNotification(validNotification);
            expect(result.success).toBe(true);
        });
    });
});

describe('Notification Schema', () => {
    describe('safeValidateNotification', () => {
        it('should validate a valid notification', () => {
            const validNotification = {
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: 'email',
                recipient: {
                    user_id: 'user-123',
                    email: 'test@example.com',
                },
                content: {
                    email: {
                        subject: 'Test',
                        message: 'Test message',
                    },
                },
                webhook_url: 'https://webhook.example.com/callback',
                status: NOTIFICATION_STATUS.pending,
                retry_count: 0,
            };

            const result = safeValidateNotification(validNotification);
            expect(result.success).toBe(true);
        });

        it('should validate all notification statuses', () => {
            const baseNotification = {
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: 'email',
                recipient: {
                    user_id: 'user-123',
                    email: 'test@example.com',
                },
                content: {
                    email: {
                        subject: 'Test',
                        message: 'Test message',
                    },
                },
                webhook_url: 'https://webhook.example.com/callback',
                retry_count: 0,
            };

            const statuses = Object.values(NOTIFICATION_STATUS);
            for (const status of statuses) {
                const result = safeValidateNotification({ ...baseNotification, status });
                expect(result.success).toBe(true);
            }
        });
    });
});

describe('Outbox Schema', () => {
    describe('safeValidateOutbox', () => {
        it('should validate a valid outbox entry', () => {
            const validOutbox = {
                notification_id: new mongoose.Types.ObjectId(),
                topic: getTopicForChannel('email'),
                payload: {
                    notification_id: new mongoose.Types.ObjectId(),
                    request_id: randomUUID(),
                    client_id: randomUUID(),
                    channel: 'email',
                    recipient: {
                        user_id: 'user-123',
                        email: 'test@example.com',
                    },
                    content: {
                        subject: 'Test',
                        message: 'Test message',
                    },
                    webhook_url: 'https://webhook.example.com/callback',
                    retry_count: 0,
                    created_at: new Date(),
                },
                status: OUTBOX_STATUS.pending,
            };

            const result = safeValidateOutbox(validOutbox);
            expect(result.success).toBe(true);
        });

        it('should validate all outbox statuses', () => {
            const baseOutbox = {
                notification_id: new mongoose.Types.ObjectId(),
                topic: getTopicForChannel('email'),
                payload: {
                    notification_id: new mongoose.Types.ObjectId(),
                    request_id: randomUUID(),
                    client_id: randomUUID(),
                    channel: 'email',
                    recipient: {
                        user_id: 'user-123',
                        email: 'test@example.com',
                    },
                    content: {
                        subject: 'Test',
                        message: 'Test message',
                    },
                    webhook_url: 'https://webhook.example.com/callback',
                    retry_count: 0,
                    created_at: new Date(),
                },
            };

            const statuses = Object.values(OUTBOX_STATUS);
            for (const status of statuses) {
                const result = safeValidateOutbox({ ...baseOutbox, status });
                expect(result.success).toBe(true);
            }
        });
    });
});
