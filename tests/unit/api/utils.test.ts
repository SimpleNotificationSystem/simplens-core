/**
 * Unit Tests for API Utility Functions
 * Tests conversion functions and error handling
 * 
 * Updated for plugin-based architecture - uses dynamic channel strings.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { NOTIFICATION_STATUS, getTopicForChannel } from '../../../src/types/types.js';
import type { notification_request, batch_notification_request, notification } from '../../../src/types/types.js';

// We need to mock the database models before importing utils
vi.mock('../../../src/database/models/notification.models.js', () => ({
    default: {
        insertMany: vi.fn(),
        findOne: vi.fn(),
    },
}));

vi.mock('../../../src/database/models/outbox.models.js', () => ({
    default: {
        insertMany: vi.fn(),
    },
}));

vi.mock('../../../src/workers/utils/logger.js', () => ({
    apiLogger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        success: vi.fn(),
        debug: vi.fn(),
    },
}));

describe('API Utility Functions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('convert_notification_request_to_notification_schema', () => {
        it('should convert a single-channel request to notifications array', async () => {
            // Dynamic import after mocks are set up
            const { convert_notification_request_to_notification_schema } = await import('../../../src/api/utils/utils.js');

            const request: notification_request = {
                request_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
                client_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
                channel: ['email'],
                recipient: {
                    user_id: 'user-123',
                    email: 'test@example.com',
                },
                content: {
                    email: {
                        subject: 'Test Subject',
                        message: 'Test message',
                    },
                },
                webhook_url: 'https://webhook.example.com/callback',
            };

            const notifications = convert_notification_request_to_notification_schema(request);

            expect(notifications).toHaveLength(1);
            expect(notifications[0].channel).toBe('email');
            expect(notifications[0].request_id).toBe(request.request_id);
            expect(notifications[0].recipient.email).toBe('test@example.com');
            expect(notifications[0].status).toBe(NOTIFICATION_STATUS.pending);
        });

        it('should create multiple notifications for multi-channel request', async () => {
            const { convert_notification_request_to_notification_schema } = await import('../../../src/api/utils/utils.js');

            const request: notification_request = {
                request_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
                client_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
                channel: ['email', 'whatsapp'],
                recipient: {
                    user_id: 'user-123',
                    email: 'test@example.com',
                    phone: '+1234567890',
                },
                content: {
                    email: {
                        subject: 'Test Subject',
                        message: 'Email message',
                    },
                    whatsapp: {
                        message: 'WhatsApp message',
                    },
                },
                webhook_url: 'https://webhook.example.com/callback',
            };

            const notifications = convert_notification_request_to_notification_schema(request);

            expect(notifications).toHaveLength(2);
            expect(notifications.map(n => n.channel).sort()).toEqual(['email', 'whatsapp'].sort());
        });

        it('should preserve scheduled_at for delayed notifications', async () => {
            const { convert_notification_request_to_notification_schema } = await import('../../../src/api/utils/utils.js');

            const futureDate = new Date(Date.now() + 60000);
            const request: notification_request = {
                request_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
                client_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
                channel: ['email'],
                recipient: {
                    user_id: 'user-123',
                    email: 'test@example.com',
                },
                content: {
                    email: {
                        subject: 'Scheduled',
                        message: 'Scheduled message',
                    },
                },
                webhook_url: 'https://webhook.example.com/callback',
                scheduled_at: futureDate,
            };

            const notifications = convert_notification_request_to_notification_schema(request);

            expect(notifications[0].scheduled_at).toEqual(futureDate);
        });

        it('should handle provider as string (applies to all channels)', async () => {
            const { convert_notification_request_to_notification_schema } = await import('../../../src/api/utils/utils.js');

            const request: notification_request = {
                request_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
                client_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
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

            const notifications = convert_notification_request_to_notification_schema(request);

            expect(notifications[0].provider).toBe('gmail');
        });

        it('should handle provider as array (maps to channels)', async () => {
            const { convert_notification_request_to_notification_schema } = await import('../../../src/api/utils/utils.js');

            const request: notification_request = {
                request_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
                client_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
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

            const notifications = convert_notification_request_to_notification_schema(request);

            expect(notifications).toHaveLength(2);
            const emailNotif = notifications.find(n => n.channel === 'email');
            const whatsappNotif = notifications.find(n => n.channel === 'whatsapp');
            expect(emailNotif?.provider).toBe('gmail');
            expect(whatsappNotif?.provider).toBe('twilio');
        });
    });

    describe('convert_batch_notification_schema_to_notification_schema', () => {
        it('should convert batch request to multiple notifications', async () => {
            const { convert_batch_notification_schema_to_notification_schema } = await import('../../../src/api/utils/utils.js');

            const request: batch_notification_request = {
                client_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
                channel: ['email'],
                content: {
                    email: {
                        subject: 'Batch Subject',
                        message: 'Hello {{name}}',
                    },
                },
                recipients: [
                    { request_id: randomUUID(), user_id: 'user-1', email: 'user1@example.com', variables: { name: 'User 1' } },
                    { request_id: randomUUID(), user_id: 'user-2', email: 'user2@example.com', variables: { name: 'User 2' } },
                    { request_id: randomUUID(), user_id: 'user-3', email: 'user3@example.com', variables: { name: 'User 3' } },
                ],
                webhook_url: 'https://webhook.example.com/callback',
            };

            const notifications = convert_batch_notification_schema_to_notification_schema(request);

            expect(notifications).toHaveLength(3);
            expect(notifications[0].recipient.email).toBe('user1@example.com');
            expect(notifications[1].recipient.email).toBe('user2@example.com');
            expect(notifications[2].recipient.email).toBe('user3@example.com');
        });

        it('should create notifications for each channel per recipient', async () => {
            const { convert_batch_notification_schema_to_notification_schema } = await import('../../../src/api/utils/utils.js');

            const request: batch_notification_request = {
                client_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
                channel: ['email', 'whatsapp'],
                content: {
                    email: {
                        subject: 'Test',
                        message: 'Email message',
                    },
                    whatsapp: {
                        message: 'WhatsApp message',
                    },
                },
                recipients: [
                    { request_id: randomUUID(), user_id: 'user-1', email: 'user1@example.com', phone: '+1111111111' },
                    { request_id: randomUUID(), user_id: 'user-2', email: 'user2@example.com', phone: '+2222222222' },
                ],
                webhook_url: 'https://webhook.example.com/callback',
            };

            const notifications = convert_batch_notification_schema_to_notification_schema(request);

            // 2 recipients x 2 channels = 4 notifications
            expect(notifications).toHaveLength(4);
        });
    });

    describe('DuplicateNotificationError', () => {
        it('should create error with correct properties', async () => {
            const { DuplicateNotificationError } = await import('../../../src/api/utils/utils.js');

            const duplicates = [
                { request_id: randomUUID(), channel: 'email' },
                { request_id: randomUUID(), channel: 'whatsapp' },
            ];

            const error = new DuplicateNotificationError('Duplicate found', duplicates);

            expect(error.name).toBe('DuplicateNotificationError');
            expect(error.duplicateCount).toBe(2);
            expect(error.duplicateKeys).toEqual(duplicates);
            expect(error.message).toBe('Duplicate found');
        });

        it('should handle empty duplicates array', async () => {
            const { DuplicateNotificationError } = await import('../../../src/api/utils/utils.js');

            const error = new DuplicateNotificationError('No duplicates');

            expect(error.duplicateCount).toBe(0);
            expect(error.duplicateKeys).toEqual([]);
        });
    });

    describe('to_channel_notification', () => {
        it('should convert notification to channel format', async () => {
            const { to_channel_notification } = await import('../../../src/api/utils/utils.js');

            const notification: notification = {
                request_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
                client_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
                channel: 'email',
                recipient: {
                    user_id: 'user-123',
                    email: 'test@example.com',
                },
                content: {
                    email: {
                        subject: 'Test Subject',
                        message: 'Test message',
                    },
                },
                variables: { name: 'Test User' },
                webhook_url: 'https://webhook.example.com/callback',
                status: NOTIFICATION_STATUS.pending,
                retry_count: 0,
            };

            const notificationId = new mongoose.Types.ObjectId();
            const channelNotification = to_channel_notification(notification, notificationId);

            expect(channelNotification.notification_id).toEqual(notificationId);
            expect(channelNotification.channel).toBe('email');
            expect((channelNotification.recipient as any).email).toBe('test@example.com');
        });

        it('should extract channel-specific content', async () => {
            const { to_channel_notification } = await import('../../../src/api/utils/utils.js');

            const notification: notification = {
                request_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
                client_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
                channel: 'email',
                recipient: {
                    user_id: 'user-123',
                    email: 'test@example.com',
                },
                content: {
                    email: {
                        subject: 'Nested Subject',
                        message: 'Nested message',
                    },
                },
                webhook_url: 'https://webhook.example.com/callback',
                status: NOTIFICATION_STATUS.pending,
                retry_count: 0,
            };

            const notificationId = new mongoose.Types.ObjectId();
            const channelNotification = to_channel_notification(notification, notificationId);

            // Content should be extracted from content.email
            expect((channelNotification.content as any).subject).toBe('Nested Subject');
            expect((channelNotification.content as any).message).toBe('Nested message');
        });
    });

    describe('to_delayed_notification_topic', () => {
        it('should convert notification to delayed format', async () => {
            const { to_delayed_notification_topic } = await import('../../../src/api/utils/utils.js');

            const scheduledAt = new Date(Date.now() + 60000);
            const notification: notification = {
                request_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
                client_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
                channel: 'email',
                recipient: {
                    user_id: 'user-123',
                    email: 'test@example.com',
                },
                content: {
                    email: {
                        subject: 'Scheduled',
                        message: 'Scheduled message',
                    },
                },
                webhook_url: 'https://webhook.example.com/callback',
                status: NOTIFICATION_STATUS.pending,
                retry_count: 0,
                scheduled_at: scheduledAt,
            };

            const notificationId = new mongoose.Types.ObjectId();
            const delayedNotification = to_delayed_notification_topic(notification, notificationId);

            expect(delayedNotification.notification_id).toEqual(notificationId);
            expect(delayedNotification.scheduled_at).toEqual(scheduledAt);
            expect(delayedNotification.target_topic).toBe(getTopicForChannel('email'));
        });
    });
});
