/**
 * Mock Factories for Testing
 * Creates mock data structures for notifications, outbox entries, etc.
 * 
 * Updated for plugin-based architecture - uses dynamic channel strings.
 */
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import type {
    notification_request,
    batch_notification_request,
    notification,
    delayed_notification_topic,
    outbox,
    base_notification
} from '../../src/types/types.js';
import { NOTIFICATION_STATUS, OUTBOX_STATUS, getTopicForChannel } from '../../src/types/types.js';

/**
 * Create a mock notification request
 */
export const createMockNotificationRequest = (
    overrides: Partial<notification_request> = {}
): notification_request => ({
    request_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
    client_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
    channel: ['email'],
    recipient: {
        user_id: 'test-user-123',
        email: 'test@example.com',
    },
    content: {
        email: {
            subject: 'Test Subject',
            message: 'Test message body'
        },
    },
    webhook_url: 'https://webhook.example.com/callback',
    ...overrides,
});

/**
 * Create a mock batch notification request
 */
export const createMockBatchNotificationRequest = (
    overrides: Partial<batch_notification_request> = {}
): batch_notification_request => ({
    client_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
    channel: ['email'],
    content: {
        email: {
            subject: 'Batch Test',
            message: 'Hello {{name}}'
        },
    },
    recipients: [
        { request_id: randomUUID(), user_id: 'user-1', email: 'user1@example.com', variables: { name: 'User 1' } },
        { request_id: randomUUID(), user_id: 'user-2', email: 'user2@example.com', variables: { name: 'User 2' } },
    ],
    webhook_url: 'https://webhook.example.com/callback',
    ...overrides,
});

/**
 * Create a mock notification (internal schema)
 */
export const createMockNotification = (
    overrides: Partial<notification> = {}
): notification => ({
    request_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
    client_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
    channel: 'email',
    recipient: {
        user_id: 'test-user-123',
        email: 'test@example.com',
    },
    content: {
        subject: 'Test Subject',
        message: 'Test message body'
    },
    webhook_url: 'https://webhook.example.com/callback',
    status: NOTIFICATION_STATUS.pending,
    retry_count: 0,
    ...overrides,
});

/**
 * Create a mock base notification (Kafka topic schema - channel-agnostic)
 */
export const createMockBaseNotification = (
    channel: string = 'email',
    overrides: Partial<base_notification> = {}
): base_notification => ({
    notification_id: new mongoose.Types.ObjectId().toString(),
    request_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
    client_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
    channel: channel,
    recipient: {
        user_id: 'test-user-123',
        email: 'test@example.com',
    },
    content: {
        subject: 'Test Subject',
        message: 'Test message body',
    },
    variables: {},
    webhook_url: 'https://webhook.example.com/callback',
    retry_count: 0,
    created_at: new Date(),
    ...overrides,
});

/**
 * Create a mock delayed notification (for delayed queue)
 */
export const createMockDelayedNotification = (
    channel: string = 'email',
    overrides: Partial<delayed_notification_topic> = {}
): delayed_notification_topic => ({
    notification_id: new mongoose.Types.ObjectId(),
    request_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
    client_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
    target_topic: getTopicForChannel(channel),
    scheduled_at: new Date(Date.now() + 60000), // 1 minute from now
    payload: createMockBaseNotification(channel),
    created_at: new Date(),
    ...overrides,
});

/**
 * Create a mock outbox entry
 */
export const createMockOutbox = (
    channel: string = 'email',
    overrides: Partial<outbox> = {}
): outbox => ({
    notification_id: new mongoose.Types.ObjectId(),
    topic: getTopicForChannel(channel),
    payload: createMockBaseNotification(channel),
    status: OUTBOX_STATUS.pending,
    ...overrides,
});

/**
 * Generate a valid MongoDB ObjectId
 */
export const createObjectId = (): mongoose.Types.ObjectId => {
    return new mongoose.Types.ObjectId();
};

/**
 * Generate a valid UUIDv4
 */
export const createUUID = (): `${string}-${string}-${string}-${string}-${string}` => {
    return randomUUID() as `${string}-${string}-${string}-${string}-${string}`;
};

// ============================================================================
// BACKWARD-COMPATIBLE EXPORTS (for legacy tests)
// ============================================================================

/**
 * @deprecated Use createMockBaseNotification('email') instead
 */
export const createMockEmailNotification = (overrides: Record<string, unknown> = {}) =>
    createMockBaseNotification('email', overrides as any);

/**
 * @deprecated Use createMockBaseNotification('whatsapp') instead
 */
export const createMockWhatsappNotification = (overrides: Record<string, unknown> = {}) =>
    createMockBaseNotification('whatsapp', overrides as any);

