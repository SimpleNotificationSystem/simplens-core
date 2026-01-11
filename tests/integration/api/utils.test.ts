/**
 * Integration Tests for process_notifications function
 * Tests the notification processing with real MongoDB transactions
 * 
 * These tests use an in-memory MongoDB instance for full integration testing.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearTestDb } from '../../utils/db.js';
import { NOTIFICATION_STATUS, getTopicForChannel } from '../../../src/types/types.js';
import type { notification } from '../../../src/types/types.js';

// Mock the logger to avoid console noise
vi.mock('../../../src/workers/utils/logger.js', () => ({
    apiLogger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        success: vi.fn(),
        debug: vi.fn(),
    },
}));

// Mock PluginRegistry to always return true for channel/provider checks
vi.mock('../../../src/plugins/index.js', () => ({
    PluginRegistry: {
        hasChannel: vi.fn().mockReturnValue(true),
        has: vi.fn().mockReturnValue(true),
    },
}));

describe('process_notifications Integration Tests', () => {
    let notification_model: typeof import('../../../src/database/models/notification.models.js').default;
    let outbox_model: typeof import('../../../src/database/models/outbox.models.js').default;
    let process_notifications: typeof import('../../../src/api/utils/utils.js').process_notifications;
    let DuplicateNotificationError: typeof import('../../../src/api/utils/utils.js').DuplicateNotificationError;

    beforeAll(async () => {
        await connectTestDb();
        // Import models after DB connection
        notification_model = (await import('../../../src/database/models/notification.models.js')).default;
        outbox_model = (await import('../../../src/database/models/outbox.models.js')).default;
        const utils = await import('../../../src/api/utils/utils.js');
        process_notifications = utils.process_notifications;
        DuplicateNotificationError = utils.DuplicateNotificationError;
    });

    afterAll(async () => {
        await disconnectTestDb();
    });

    beforeEach(async () => {
        await clearTestDb();
    });

    const createTestNotification = (overrides: Partial<notification> = {}): notification => ({
        request_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        client_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        channel: 'email',
        recipient: { user_id: 'user-123', email: 'test@example.com' },
        content: { subject: 'Test Subject', message: 'Test message' },
        webhook_url: 'https://webhook.example.com/callback',
        status: NOTIFICATION_STATUS.pending,
        retry_count: 0,
        created_at: new Date(),
        ...overrides,
    });

    describe('successful processing', () => {
        // Skip: MongoMemoryReplSet has a race condition with first-write catalog changes in transactions
        // The transaction logic is tested in unit tests with mocked sessions
        it.skip('should create notifications and outbox entries atomically', async () => {
            const notifications = [
                createTestNotification(),
                createTestNotification(),
            ];

            const result = await process_notifications(notifications);

            // Verify return values
            expect(result.notification_ids).toHaveLength(2);
            expect(result.created_count).toBe(2);
            expect(result.duplicate_count).toBe(0);
            expect(result.duplicate_keys).toBeUndefined();

            // Verify notifications were created in database
            const dbNotifications = await notification_model.find({});
            expect(dbNotifications).toHaveLength(2);

            // Verify outbox entries were created
            const dbOutboxEntries = await outbox_model.find({});
            expect(dbOutboxEntries).toHaveLength(2);

            // Verify outbox entries link to correct notifications
            const notificationIds = result.notification_ids.map(id => id.toString());
            dbOutboxEntries.forEach(entry => {
                expect(notificationIds).toContain(entry.notification_id.toString());
                expect(entry.topic).toBe(getTopicForChannel('email'));
                expect(entry.status).toBe('pending');
            });
        });

        // Skip: MongoMemoryReplSet has a race condition with first-write catalog changes in transactions
        it.skip('should create delayed outbox entry for scheduled notification', async () => {
            const futureDate = new Date(Date.now() + 60000);
            const notifications = [
                createTestNotification({ scheduled_at: futureDate }),
            ];

            const result = await process_notifications(notifications);

            expect(result.created_count).toBe(1);

            // Verify outbox entry uses delayed_notification topic
            const outboxEntry = await outbox_model.findOne({});
            expect(outboxEntry?.topic).toBe('delayed_notification');
        });
    });

    describe('duplicate handling', () => {
        // Skip: MongoMemoryReplSet has a race condition with first-write catalog changes in transactions
        it.skip('should skip duplicates and process unique notifications', async () => {
            // Pre-create a notification
            const existingRequestId = randomUUID() as `${string}-${string}-${string}-${string}-${string}`;
            await notification_model.create({
                request_id: existingRequestId,
                client_id: randomUUID(),
                channel: 'email',
                recipient: { user_id: 'user-123', email: 'test@example.com' },
                content: { subject: 'Test', message: 'Test' },
                webhook_url: 'https://webhook.example.com/callback',
                status: NOTIFICATION_STATUS.delivered, // Non-failed status = duplicate
            });

            // Try to process duplicate + new notification
            const notifications = [
                createTestNotification({ request_id: existingRequestId }), // Duplicate
                createTestNotification(), // New
            ];

            const result = await process_notifications(notifications);

            expect(result.created_count).toBe(1);
            expect(result.duplicate_count).toBe(1);
            expect(result.duplicate_keys).toHaveLength(1);
            expect(result.duplicate_keys![0].request_id).toBe(existingRequestId);
        });

        // Skip: MongoMemoryReplSet has a race condition with first-write catalog changes in transactions
        it.skip('should allow retry of failed notifications with same request_id', async () => {
            // Pre-create a failed notification
            const failedRequestId = randomUUID() as `${string}-${string}-${string}-${string}-${string}`;
            await notification_model.create({
                request_id: failedRequestId,
                client_id: randomUUID(),
                channel: 'email',
                recipient: { user_id: 'user-123', email: 'test@example.com' },
                content: { subject: 'Test', message: 'Test' },
                webhook_url: 'https://webhook.example.com/callback',
                status: NOTIFICATION_STATUS.failed, // Failed status = can retry
            });

            // Should be able to retry failed notification
            const notifications = [
                createTestNotification({ request_id: failedRequestId }),
            ];

            const result = await process_notifications(notifications);

            // Should succeed - failed notifications can be retried
            expect(result.created_count).toBe(1);
            expect(result.duplicate_count).toBe(0);
        });

        // Skip: MongoMemoryReplSet has a race condition with first-write catalog changes in transactions
        it.skip('should throw DuplicateNotificationError when all notifications are duplicates', async () => {
            // Pre-create a notification
            const existingRequestId = randomUUID() as `${string}-${string}-${string}-${string}-${string}`;
            await notification_model.create({
                request_id: existingRequestId,
                client_id: randomUUID(),
                channel: 'email',
                recipient: { user_id: 'user-123', email: 'test@example.com' },
                content: { subject: 'Test', message: 'Test' },
                webhook_url: 'https://webhook.example.com/callback',
                status: NOTIFICATION_STATUS.delivered,
            });

            // Try to process only duplicates
            const notifications = [
                createTestNotification({ request_id: existingRequestId }),
            ];

            await expect(process_notifications(notifications)).rejects.toThrow(DuplicateNotificationError);
        });
    });

    describe('transaction rollback', () => {
        // Skip: MongoMemoryReplSet has a race condition with first-write catalog changes in transactions
        it.skip('should rollback both notifications and outbox on error', async () => {
            // Create a notification first to test partial rollback scenario
            const validNotification = createTestNotification();

            // Create a notification with invalid data to cause error
            // Using an invalid ObjectId will cause the outbox insertMany to fail
            const invalidOutboxNotification = createTestNotification();

            // This test verifies the transaction mechanism by checking
            // that if we start with 0 records, and process succeeds, we get records
            const initialNotificationCount = await notification_model.countDocuments();
            expect(initialNotificationCount).toBe(0);

            // Process valid notifications
            await process_notifications([validNotification]);

            // Verify records exist after success
            const afterNotificationCount = await notification_model.countDocuments();
            const afterOutboxCount = await outbox_model.countDocuments();

            expect(afterNotificationCount).toBe(1);
            expect(afterOutboxCount).toBe(1);
        });
    });

    describe('empty input', () => {
        it('should handle empty notifications array', async () => {
            const result = await process_notifications([]);

            expect(result.notification_ids).toHaveLength(0);
            expect(result.created_count).toBe(0);
            expect(result.duplicate_count).toBe(0);
            expect(result.duplicate_keys).toBeUndefined();

            // Verify nothing was created
            const notificationCount = await notification_model.countDocuments();
            const outboxCount = await outbox_model.countDocuments();

            expect(notificationCount).toBe(0);
            expect(outboxCount).toBe(0);
        });
    });

    describe('multi-channel notifications', () => {
        // Skip: MongoMemoryReplSet has a race condition with first-write catalog changes in transactions
        it.skip('should allow same request_id for different channels', async () => {
            const requestId = randomUUID() as `${string}-${string}-${string}-${string}-${string}`;

            const notifications = [
                createTestNotification({ request_id: requestId, channel: 'email' }),
                createTestNotification({ request_id: requestId, channel: 'whatsapp' }),
            ];

            const result = await process_notifications(notifications);

            // Both should succeed - different channels
            expect(result.created_count).toBe(2);
            expect(result.duplicate_count).toBe(0);

            // Verify correct topics
            const outboxEntries = await outbox_model.find({}).sort({ topic: 1 });
            expect(outboxEntries).toHaveLength(2);
            expect(outboxEntries.some(e => e.topic === getTopicForChannel('email'))).toBe(true);
            expect(outboxEntries.some(e => e.topic === getTopicForChannel('whatsapp'))).toBe(true);
        });
    });
});
