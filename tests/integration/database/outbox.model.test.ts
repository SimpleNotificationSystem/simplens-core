/**
 * Integration tests for outbox.models.ts
 * Tests MongoDB outbox model with in-memory database
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearTestDb } from '../../utils/db';
import { TOPICS, OUTBOX_STATUS, CHANNEL } from '../../../src/types/types';
import { createMockEmailNotification } from '../../utils/mocks.js';

describe('Outbox Model', () => {
    let outbox_model: typeof import('../../../src/database/models/outbox.models.js').default;
    let notification_model: typeof import('../../../src/database/models/notification.models.js').default;

    beforeAll(async () => {
        await connectTestDb();
        // Import models after connection
        outbox_model = (await import('../../../src/database/models/outbox.models.js')).default;
        notification_model = (await import('../../../src/database/models/notification.models.js')).default;
    });

    afterAll(async () => {
        await disconnectTestDb();
    });

    beforeEach(async () => {
        await clearTestDb();
    });

    describe('Create outbox entry', () => {
        it('should create entry with default status pending', async () => {
            const notificationId = new mongoose.Types.ObjectId();
            const payload = createMockEmailNotification();

            const entry = await outbox_model.create({
                notification_id: notificationId,
                topic: TOPICS.email_notification,
                payload,
            });

            expect(entry.status).toBe(OUTBOX_STATUS.pending);
            expect(entry.notification_id.toString()).toBe(notificationId.toString());
        });

        it('should create entry with all fields', async () => {
            const notificationId = new mongoose.Types.ObjectId();
            const payload = createMockEmailNotification();
            const workerId = 'worker-123';

            const entry = await outbox_model.create({
                notification_id: notificationId,
                topic: TOPICS.email_notification,
                payload,
                status: OUTBOX_STATUS.pending,
                claimed_by: workerId,
                claimed_at: new Date(),
            });

            expect(entry.claimed_by).toBe(workerId);
            expect(entry.claimed_at).toBeDefined();
        });

        it('should set timestamps automatically', async () => {
            const notificationId = new mongoose.Types.ObjectId();
            const payload = createMockEmailNotification();

            const entry = await outbox_model.create({
                notification_id: notificationId,
                topic: TOPICS.email_notification,
                payload,
            });

            expect(entry.created_at).toBeDefined();
            expect(entry.updated_at).toBeDefined();
        });
    });

    describe('Topic enum validation', () => {
        it('should accept valid topic: email_notification', async () => {
            const entry = await outbox_model.create({
                notification_id: new mongoose.Types.ObjectId(),
                topic: TOPICS.email_notification,
                payload: createMockEmailNotification(),
            });

            expect(entry.topic).toBe(TOPICS.email_notification);
        });

        it('should accept valid topic: whatsapp_notification', async () => {
            const entry = await outbox_model.create({
                notification_id: new mongoose.Types.ObjectId(),
                topic: TOPICS.whatsapp_notification,
                payload: { test: true },
            });

            expect(entry.topic).toBe(TOPICS.whatsapp_notification);
        });

        it('should accept valid topic: delayed_notification', async () => {
            const entry = await outbox_model.create({
                notification_id: new mongoose.Types.ObjectId(),
                topic: TOPICS.delayed_notification,
                payload: { test: true },
            });

            expect(entry.topic).toBe(TOPICS.delayed_notification);
        });

        it('should reject invalid topic', async () => {
            await expect(
                outbox_model.create({
                    notification_id: new mongoose.Types.ObjectId(),
                    topic: 'invalid_topic',
                    payload: {},
                })
            ).rejects.toThrow();
        });
    });

    describe('Status enum validation', () => {
        it('should accept valid status: pending', async () => {
            const entry = await outbox_model.create({
                notification_id: new mongoose.Types.ObjectId(),
                topic: TOPICS.email_notification,
                payload: {},
                status: OUTBOX_STATUS.pending,
            });

            expect(entry.status).toBe(OUTBOX_STATUS.pending);
        });

        it('should accept valid status: published', async () => {
            const entry = await outbox_model.create({
                notification_id: new mongoose.Types.ObjectId(),
                topic: TOPICS.email_notification,
                payload: {},
                status: OUTBOX_STATUS.published,
            });

            expect(entry.status).toBe(OUTBOX_STATUS.published);
        });

        it('should reject invalid status', async () => {
            await expect(
                outbox_model.create({
                    notification_id: new mongoose.Types.ObjectId(),
                    topic: TOPICS.email_notification,
                    payload: {},
                    status: 'invalid_status',
                })
            ).rejects.toThrow();
        });
    });

    describe('Query operations', () => {
        it('should find pending entries', async () => {
            // Create mix of pending and published
            await outbox_model.create([
                {
                    notification_id: new mongoose.Types.ObjectId(),
                    topic: TOPICS.email_notification,
                    payload: {},
                    status: OUTBOX_STATUS.pending,
                },
                {
                    notification_id: new mongoose.Types.ObjectId(),
                    topic: TOPICS.email_notification,
                    payload: {},
                    status: OUTBOX_STATUS.published,
                },
                {
                    notification_id: new mongoose.Types.ObjectId(),
                    topic: TOPICS.email_notification,
                    payload: {},
                    status: OUTBOX_STATUS.pending,
                },
            ]);

            const pendingEntries = await outbox_model.find({
                status: OUTBOX_STATUS.pending,
            });

            expect(pendingEntries).toHaveLength(2);
        });

        it('should find entries by topic', async () => {
            await outbox_model.create([
                {
                    notification_id: new mongoose.Types.ObjectId(),
                    topic: TOPICS.email_notification,
                    payload: {},
                },
                {
                    notification_id: new mongoose.Types.ObjectId(),
                    topic: TOPICS.whatsapp_notification,
                    payload: {},
                },
            ]);

            const emailEntries = await outbox_model.find({
                topic: TOPICS.email_notification,
            });

            expect(emailEntries).toHaveLength(1);
        });

        it('should find unclaimed entries', async () => {
            await outbox_model.create([
                {
                    notification_id: new mongoose.Types.ObjectId(),
                    topic: TOPICS.email_notification,
                    payload: {},
                    claimed_by: null,
                },
                {
                    notification_id: new mongoose.Types.ObjectId(),
                    topic: TOPICS.email_notification,
                    payload: {},
                    claimed_by: 'worker-1',
                },
            ]);

            const unclaimedEntries = await outbox_model.find({
                claimed_by: null,
            });

            expect(unclaimedEntries).toHaveLength(1);
        });
    });

    describe('Update operations', () => {
        it('should update status to published', async () => {
            const entry = await outbox_model.create({
                notification_id: new mongoose.Types.ObjectId(),
                topic: TOPICS.email_notification,
                payload: {},
                status: OUTBOX_STATUS.pending,
            });

            await outbox_model.updateOne(
                { _id: entry._id },
                { status: OUTBOX_STATUS.published }
            );

            const updated = await outbox_model.findById(entry._id);
            expect(updated!.status).toBe(OUTBOX_STATUS.published);
        });

        it('should claim entry by worker', async () => {
            const entry = await outbox_model.create({
                notification_id: new mongoose.Types.ObjectId(),
                topic: TOPICS.email_notification,
                payload: {},
            });

            const claimTime = new Date();
            await outbox_model.updateOne(
                { _id: entry._id },
                {
                    claimed_by: 'worker-abc',
                    claimed_at: claimTime,
                }
            );

            const updated = await outbox_model.findById(entry._id);
            expect(updated!.claimed_by).toBe('worker-abc');
            expect(updated!.claimed_at).toBeDefined();
        });

        it('should update updated_at on modification', async () => {
            const entry = await outbox_model.create({
                notification_id: new mongoose.Types.ObjectId(),
                topic: TOPICS.email_notification,
                payload: {},
            });

            const originalUpdatedAt = entry.updated_at;

            // Small delay to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 10));

            await outbox_model.findByIdAndUpdate(
                entry._id,
                { status: OUTBOX_STATUS.published },
                { new: true }
            );

            const updated = await outbox_model.findById(entry._id);
            expect(updated!.updated_at!.getTime()).toBeGreaterThan(originalUpdatedAt!.getTime());
        });
    });
});
