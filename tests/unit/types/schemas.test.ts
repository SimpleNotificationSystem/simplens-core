/**
 * Unit Tests for Zod Schema Validation
 * Tests all notification schemas for proper validation behavior
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import {
    safeValidateNotificationRequest,
    safeValidateBatchNotificationRequest,
    safeValidateEmailNotification,
    safeValidateWhatsappNotification,
    safeValidateNotification,
    safeValidateOutbox,
} from '../../../src/types/schemas.js';
import { CHANNEL, NOTIFICATION_STATUS, OUTBOX_STATUS, OUTBOX_TOPICS } from '../../../src/types/types.js';

describe('Notification Request Schema', () => {
    describe('safeValidateNotificationRequest', () => {
        it('should validate a valid email notification request', () => {
            const validRequest = {
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: [CHANNEL.email],
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
                expect(result.data.channel).toEqual([CHANNEL.email]);
            }
        });

        it('should validate a valid whatsapp notification request', () => {
            const validRequest = {
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: [CHANNEL.whatsapp],
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
                channel: [CHANNEL.email, CHANNEL.whatsapp],
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

        it('should fail when email channel is specified but email is missing', () => {
            const invalidRequest = {
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: [CHANNEL.email],
                recipient: {
                    user_id: 'user-123',
                    // email is missing
                },
                content: {
                    email: {
                        subject: 'Test Subject',
                        message: 'Test message body',
                    },
                },
                webhook_url: 'https://webhook.example.com/callback',
            };

            const result = safeValidateNotificationRequest(invalidRequest);
            expect(result.success).toBe(false);
        });

        it('should fail when whatsapp channel is specified but phone is missing', () => {
            const invalidRequest = {
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: [CHANNEL.whatsapp],
                recipient: {
                    user_id: 'user-123',
                    // phone is missing
                },
                content: {
                    whatsapp: {
                        message: 'Test message',
                    },
                },
                webhook_url: 'https://webhook.example.com/callback',
            };

            const result = safeValidateNotificationRequest(invalidRequest);
            expect(result.success).toBe(false);
        });

        it('should fail with invalid UUID format for request_id', () => {
            const invalidRequest = {
                request_id: 'not-a-valid-uuid',
                client_id: randomUUID(),
                channel: [CHANNEL.email],
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

            const result = safeValidateNotificationRequest(invalidRequest);
            expect(result.success).toBe(false);
        });

        it('should fail with invalid webhook URL', () => {
            const invalidRequest = {
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: [CHANNEL.email],
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
                channel: [CHANNEL.email],
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
    });
});

describe('Batch Notification Request Schema', () => {
    describe('safeValidateBatchNotificationRequest', () => {
        it('should validate a valid batch notification request', () => {
            const validRequest = {
                client_id: randomUUID(),
                channel: [CHANNEL.email],
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

        it('should fail when email channel specified but recipient has no email', () => {
            const invalidRequest = {
                client_id: randomUUID(),
                channel: [CHANNEL.email],
                content: {
                    email: {
                        subject: 'Test',
                        message: 'Test',
                    },
                },
                recipients: [
                    { request_id: randomUUID(), user_id: 'user-1' }, // missing email
                ],
                webhook_url: 'https://webhook.example.com/callback',
            };

            const result = safeValidateBatchNotificationRequest(invalidRequest);
            expect(result.success).toBe(false);
        });

        it('should fail when whatsapp channel specified but recipient has no phone', () => {
            const invalidRequest = {
                client_id: randomUUID(),
                channel: [CHANNEL.whatsapp],
                content: {
                    whatsapp: {
                        message: 'Test',
                    },
                },
                recipients: [
                    { request_id: randomUUID(), user_id: 'user-1' }, // missing phone
                ],
                webhook_url: 'https://webhook.example.com/callback',
            };

            const result = safeValidateBatchNotificationRequest(invalidRequest);
            expect(result.success).toBe(false);
        });
    });
});

describe('Email Notification Schema', () => {
    describe('safeValidateEmailNotification', () => {
        it('should validate a valid email notification', () => {
            const validNotification = {
                notification_id: new mongoose.Types.ObjectId(),
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: CHANNEL.email,
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

            const result = safeValidateEmailNotification(validNotification);
            expect(result.success).toBe(true);
        });

        it('should fail when channel is not email', () => {
            const invalidNotification = {
                notification_id: new mongoose.Types.ObjectId(),
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: CHANNEL.whatsapp, // wrong channel
                recipient: {
                    user_id: 'user-123',
                    email: 'test@example.com',
                },
                content: {
                    subject: 'Test Subject',
                    message: 'Test message body',
                },
                webhook_url: 'https://webhook.example.com/callback',
                retry_count: 0,
                created_at: new Date(),
            };

            const result = safeValidateEmailNotification(invalidNotification);
            expect(result.success).toBe(false);
        });
    });
});

describe('WhatsApp Notification Schema', () => {
    describe('safeValidateWhatsappNotification', () => {
        it('should validate a valid whatsapp notification', () => {
            const validNotification = {
                notification_id: new mongoose.Types.ObjectId(),
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: CHANNEL.whatsapp,
                recipient: {
                    user_id: 'user-123',
                    phone: '+1234567890',
                },
                content: {
                    message: 'Test WhatsApp message',
                },
                variables: {},
                webhook_url: 'https://webhook.example.com/callback',
                retry_count: 0,
                created_at: new Date(),
            };

            const result = safeValidateWhatsappNotification(validNotification);
            expect(result.success).toBe(true);
        });

        it('should fail when channel is not whatsapp', () => {
            const invalidNotification = {
                notification_id: new mongoose.Types.ObjectId(),
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: CHANNEL.email, // wrong channel
                recipient: {
                    user_id: 'user-123',
                    phone: '+1234567890',
                },
                content: {
                    message: 'Test message',
                },
                webhook_url: 'https://webhook.example.com/callback',
                retry_count: 0,
                created_at: new Date(),
            };

            const result = safeValidateWhatsappNotification(invalidNotification);
            expect(result.success).toBe(false);
        });
    });
});

describe('Notification Schema', () => {
    describe('safeValidateNotification', () => {
        it('should validate a valid notification', () => {
            const validNotification = {
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: CHANNEL.email,
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
                channel: CHANNEL.email,
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
                topic: OUTBOX_TOPICS.email_notification,
                payload: {
                    notification_id: new mongoose.Types.ObjectId(),
                    request_id: randomUUID(),
                    client_id: randomUUID(),
                    channel: CHANNEL.email,
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
                topic: OUTBOX_TOPICS.email_notification,
                payload: {
                    notification_id: new mongoose.Types.ObjectId(),
                    request_id: randomUUID(),
                    client_id: randomUUID(),
                    channel: CHANNEL.email,
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
