/**
 * Integration Tests for Notification Model
 * Tests MongoDB model operations with in-memory database
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { connectTestDb, disconnectTestDb, clearTestDb } from '../../utils/db.js';
import { CHANNEL, NOTIFICATION_STATUS } from '../../../src/types/types.js';

describe('Notification Model Integration Tests', () => {
    let notification_model: typeof import('../../../src/database/models/notification.models.js').default;

    beforeAll(async () => {
        await connectTestDb();
        // Import model after DB connection
        const module = await import('../../../src/database/models/notification.models.js');
        notification_model = module.default;
    });

    afterAll(async () => {
        await disconnectTestDb();
    });

    beforeEach(async () => {
        await clearTestDb();
    });

    describe('create notification', () => {
        it('should create a notification with all required fields', async () => {
            const notificationData = {
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: CHANNEL.email,
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
                status: NOTIFICATION_STATUS.pending,
                retry_count: 0,
            };

            const notification = await notification_model.create(notificationData);

            expect(notification._id).toBeDefined();
            expect(notification.request_id).toBe(notificationData.request_id);
            expect(notification.channel).toBe(CHANNEL.email);
            expect(notification.status).toBe(NOTIFICATION_STATUS.pending);
            expect(notification.created_at).toBeDefined();
        });

        it('should set default status to pending', async () => {
            const notificationData = {
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
                        message: 'Test',
                    },
                },
                webhook_url: 'https://webhook.example.com/callback',
            };

            const notification = await notification_model.create(notificationData);

            expect(notification.status).toBe(NOTIFICATION_STATUS.pending);
            expect(notification.retry_count).toBe(0);
        });

        it('should reject invalid UUID for request_id', async () => {
            const notificationData = {
                request_id: 'not-a-valid-uuid',
                client_id: randomUUID(),
                channel: CHANNEL.email,
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

            await expect(notification_model.create(notificationData)).rejects.toThrow();
        });

        it('should reject invalid UUID for client_id', async () => {
            const notificationData = {
                request_id: randomUUID(),
                client_id: 'invalid-client-id',
                channel: CHANNEL.email,
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

            await expect(notification_model.create(notificationData)).rejects.toThrow();
        });
    });

    describe('unique index on request_id + channel', () => {
        it('should allow same request_id for different channels', async () => {
            const requestId = randomUUID();
            const clientId = randomUUID();

            const emailNotification = {
                request_id: requestId,
                client_id: clientId,
                channel: CHANNEL.email,
                recipient: { user_id: 'user-123', email: 'test@example.com' },
                content: { email: { subject: 'Test', message: 'Test' } },
                webhook_url: 'https://webhook.example.com/callback',
            };

            const whatsappNotification = {
                request_id: requestId,
                client_id: clientId,
                channel: CHANNEL.whatsapp,
                recipient: { user_id: 'user-123', phone: '+1234567890' },
                content: { whatsapp: { message: 'Test' } },
                webhook_url: 'https://webhook.example.com/callback',
            };

            // Both should succeed
            await notification_model.create(emailNotification);
            await notification_model.create(whatsappNotification);

            const count = await notification_model.countDocuments({ request_id: requestId });
            expect(count).toBe(2);
        });
    });

    describe('update status', () => {
        it('should update notification status', async () => {
            const notification = await notification_model.create({
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: CHANNEL.email,
                recipient: { user_id: 'user-123', email: 'test@example.com' },
                content: { email: { subject: 'Test', message: 'Test' } },
                webhook_url: 'https://webhook.example.com/callback',
            });

            await notification_model.updateOne(
                { _id: notification._id },
                { status: NOTIFICATION_STATUS.delivered }
            );

            const updated = await notification_model.findById(notification._id);
            expect(updated?.status).toBe(NOTIFICATION_STATUS.delivered);
        });

        it('should update retry_count', async () => {
            const notification = await notification_model.create({
                request_id: randomUUID(),
                client_id: randomUUID(),
                channel: CHANNEL.email,
                recipient: { user_id: 'user-123', email: 'test@example.com' },
                content: { email: { subject: 'Test', message: 'Test' } },
                webhook_url: 'https://webhook.example.com/callback',
            });

            await notification_model.updateOne(
                { _id: notification._id },
                { $inc: { retry_count: 1 } }
            );

            const updated = await notification_model.findById(notification._id);
            expect(updated?.retry_count).toBe(1);
        });
    });

    describe('query by client_id', () => {
        it('should find notifications by client_id (indexed)', async () => {
            const clientId = randomUUID();

            await notification_model.create([
                {
                    request_id: randomUUID(),
                    client_id: clientId,
                    channel: CHANNEL.email,
                    recipient: { user_id: 'user-1', email: 'user1@example.com' },
                    content: { email: { subject: 'Test 1', message: 'Test 1' } },
                    webhook_url: 'https://webhook.example.com/callback',
                },
                {
                    request_id: randomUUID(),
                    client_id: clientId,
                    channel: CHANNEL.email,
                    recipient: { user_id: 'user-2', email: 'user2@example.com' },
                    content: { email: { subject: 'Test 2', message: 'Test 2' } },
                    webhook_url: 'https://webhook.example.com/callback',
                },
                {
                    request_id: randomUUID(),
                    client_id: randomUUID(), // Different client
                    channel: CHANNEL.email,
                    recipient: { user_id: 'user-3', email: 'user3@example.com' },
                    content: { email: { subject: 'Test 3', message: 'Test 3' } },
                    webhook_url: 'https://webhook.example.com/callback',
                },
            ]);

            const notifications = await notification_model.find({ client_id: clientId });
            expect(notifications).toHaveLength(2);
        });
    });
});
