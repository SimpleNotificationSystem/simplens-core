/**
 * Mock Factories for Testing
 * Creates mock data structures for notifications, outbox entries, etc.
 */
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import type {
    notification_request,
    batch_notification_request,
    notification,
    email_notification,
    whatsapp_notification,
    delayed_notification_topic,
    outbox
} from '../../src/types/types.js';
import { CHANNEL, NOTIFICATION_STATUS, OUTBOX_STATUS, OUTBOX_TOPICS, DELAYED_TOPICS } from '../../src/types/types.js';

/**
 * Create a mock notification request
 */
export const createMockNotificationRequest = (
    overrides: Partial<notification_request> = {}
): notification_request => ({
    request_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
    client_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
    channel: [CHANNEL.email],
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
    channel: [CHANNEL.email],
    content: {
        email: {
            subject: 'Batch Test',
            message: 'Hello {{name}}'
        },
    },
    recipients: [
        { request_id: randomUUID(),user_id: 'user-1', email: 'user1@example.com', variables: { name: 'User 1' } },
        { request_id: randomUUID(),user_id: 'user-2', email: 'user2@example.com', variables: { name: 'User 2' } },
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
    channel: CHANNEL.email,
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
    status: NOTIFICATION_STATUS.pending,
    retry_count: 0,
    ...overrides,
});

/**
 * Create a mock email notification (Kafka topic schema)
 */
export const createMockEmailNotification = (
    overrides: Partial<email_notification> = {}
): email_notification => ({
    notification_id: new mongoose.Types.ObjectId(),
    request_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
    client_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
    channel: CHANNEL.email,
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
 * Create a mock whatsapp notification (Kafka topic schema)
 */
export const createMockWhatsappNotification = (
    overrides: Partial<whatsapp_notification> = {}
): whatsapp_notification => ({
    notification_id: new mongoose.Types.ObjectId(),
    request_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
    client_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
    channel: CHANNEL.whatsapp,
    recipient: {
        user_id: 'test-user-123',
        phone: '+1234567890',
    },
    content: {
        message: 'Test WhatsApp message',
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
    overrides: Partial<delayed_notification_topic> = {}
): delayed_notification_topic => ({
    notification_id: new mongoose.Types.ObjectId(),
    request_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
    client_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
    target_topic: DELAYED_TOPICS.email_notification,
    scheduled_at: new Date(Date.now() + 60000), // 1 minute from now
    payload: createMockEmailNotification(),
    created_at: new Date(),
    ...overrides,
});

/**
 * Create a mock outbox entry
 */
export const createMockOutbox = (
    overrides: Partial<outbox> = {}
): outbox => ({
    notification_id: new mongoose.Types.ObjectId(),
    topic: OUTBOX_TOPICS.email_notification,
    payload: createMockEmailNotification(),
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
