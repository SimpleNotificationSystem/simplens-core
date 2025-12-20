/**
 * Unit tests for validation.ts
 * Tests outbox payload validation utilities
 * 
 * Updated for plugin-based architecture - uses dynamic channel strings.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { OUTBOX_STATUS, getTopicForChannel } from '../../../../src/types/types.js';
import { createMockBaseNotification, createMockDelayedNotification } from '../../../utils/mocks.js';

// Mock logger
vi.mock('@src/workers/utils/logger.js', () => ({
    producerLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
    },
}));

describe('Validation Utilities', () => {
    let validation: typeof import('../../../../src/workers/utils/validation.js');

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        validation = await import('../../../../src/workers/utils/validation.js');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    // Helper to create mock outbox document
    const createMockOutboxDocument = (
        topic: string,
        payload: unknown,
        overrides: Partial<any> = {}
    ) => {
        const doc = {
            _id: new mongoose.Types.ObjectId(),
            notification_id: new mongoose.Types.ObjectId(),
            topic,
            payload,
            status: OUTBOX_STATUS.pending,
            claimed_by: null,
            claimed_at: null,
            created_at: new Date(),
            updated_at: new Date(),
            ...overrides,
            toObject: function () {
                const { toObject, ...rest } = this;
                return rest;
            },
        };
        return doc as any;
    };

    describe('validateOutboxEntry', () => {
        it('should validate and return email notification entry', () => {
            const emailPayload = createMockBaseNotification('email');
            const doc = createMockOutboxDocument(getTopicForChannel('email'), emailPayload);

            const result = validation.validateOutboxEntry(doc);

            expect(result).not.toBeNull();
            expect(result!.topic).toBe(getTopicForChannel('email'));
            expect(result!.payload).toBeDefined();
        });

        it('should validate and return whatsapp notification entry', () => {
            const whatsappPayload = createMockBaseNotification('whatsapp');
            const doc = createMockOutboxDocument(getTopicForChannel('whatsapp'), whatsappPayload);

            const result = validation.validateOutboxEntry(doc);

            expect(result).not.toBeNull();
            expect(result!.topic).toBe(getTopicForChannel('whatsapp'));
        });

        it('should validate and return delayed notification entry', () => {
            const delayedPayload = createMockDelayedNotification();
            const doc = createMockOutboxDocument('delayed_notification', delayedPayload);

            const result = validation.validateOutboxEntry(doc);

            expect(result).not.toBeNull();
            expect(result!.topic).toBe('delayed_notification');
        });

        it('should return null for invalid outbox schema', () => {
            const doc = {
                _id: new mongoose.Types.ObjectId(),
                // Missing required fields
                toObject: function () {
                    const { toObject, ...rest } = this;
                    return rest;
                },
            } as any;

            const result = validation.validateOutboxEntry(doc);

            expect(result).toBeNull();
        });

        it('should return null for invalid payload', () => {
            const invalidPayload = {
                // Missing required fields for notification
                invalid: true,
            };
            const doc = createMockOutboxDocument(getTopicForChannel('email'), invalidPayload);

            const result = validation.validateOutboxEntry(doc);

            expect(result).toBeNull();
        });

        it('should include _id and notification_id in result', () => {
            const emailPayload = createMockBaseNotification('email');
            const doc = createMockOutboxDocument(getTopicForChannel('email'), emailPayload);

            const result = validation.validateOutboxEntry(doc);

            expect(result!._id).toBeDefined();
            expect(result!.notification_id).toBeDefined();
        });
    });

    describe('validateAndGroupByTopic', () => {
        it('should group valid entries by topic', () => {
            const emailPayload1 = createMockBaseNotification('email');
            const emailPayload2 = createMockBaseNotification('email');
            const whatsappPayload = createMockBaseNotification('whatsapp');

            const entries = [
                createMockOutboxDocument(getTopicForChannel('email'), emailPayload1),
                createMockOutboxDocument(getTopicForChannel('email'), emailPayload2),
                createMockOutboxDocument(getTopicForChannel('whatsapp'), whatsappPayload),
            ];

            const result = validation.validateAndGroupByTopic(entries);

            expect(result.groupedByTopic.get(getTopicForChannel('email'))).toHaveLength(2);
            expect(result.groupedByTopic.get(getTopicForChannel('whatsapp'))).toHaveLength(1);
            expect(result.validationFailedCount).toBe(0);
        });

        it('should count validation failures', () => {
            const validPayload = createMockBaseNotification('email');
            const invalidPayload = { invalid: true };

            const entries = [
                createMockOutboxDocument(getTopicForChannel('email'), validPayload),
                createMockOutboxDocument(getTopicForChannel('email'), invalidPayload),
            ];

            const result = validation.validateAndGroupByTopic(entries);

            expect(result.groupedByTopic.get(getTopicForChannel('email'))).toHaveLength(1);
            expect(result.validationFailedCount).toBe(1);
        });

        it('should handle empty entries array', () => {
            const result = validation.validateAndGroupByTopic([]);

            expect(result.groupedByTopic.size).toBe(0);
            expect(result.validationFailedCount).toBe(0);
        });

        it('should handle all invalid entries', () => {
            const entries = [
                createMockOutboxDocument(getTopicForChannel('email'), { invalid: true }),
                createMockOutboxDocument(getTopicForChannel('whatsapp'), { invalid: true }),
            ];

            const result = validation.validateAndGroupByTopic(entries);

            expect(result.groupedByTopic.size).toBe(0);
            expect(result.validationFailedCount).toBe(2);
        });

        it('should correctly group delayed notifications', () => {
            const delayedPayload = createMockDelayedNotification();
            const entries = [
                createMockOutboxDocument('delayed_notification', delayedPayload),
            ];

            const result = validation.validateAndGroupByTopic(entries);

            expect(result.groupedByTopic.get('delayed_notification')).toHaveLength(1);
        });
    });
});
