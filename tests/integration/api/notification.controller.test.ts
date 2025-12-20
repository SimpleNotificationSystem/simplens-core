/**
 * Integration Tests for Notification API Controller
 * Tests the complete API endpoint behavior with database mocks
 * 
 * Updated for plugin-based architecture - uses dynamic channel strings.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';

// Create a minimal express app for testing
const createTestApp = async () => {
    const app = express();
    app.use(express.json());

    // Mock auth middleware to always pass
    app.use((req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: "API KEY missing" });
        }
        const apiKey = authHeader.split(' ')[1];
        if (apiKey !== 'test-api-key') {
            return res.status(401).json({ message: "Invalid API KEY" });
        }
        next();
    });

    // Import controllers
    const { notification_controller, batch_notification_controller } = await import('../../../src/api/controllers/notification.controllers.js');

    app.post('/api/notification', notification_controller);
    app.post('/api/notification/batch', batch_notification_controller);

    return app;
};

// Mock dependencies
vi.mock('../../../src/database/models/notification.models.js', () => ({
    default: {
        insertMany: vi.fn().mockResolvedValue([
            { _id: 'mock-id-1', request_id: 'test-request-id' }
        ]),
    },
}));

vi.mock('../../../src/database/models/outbox.models.js', () => ({
    default: {
        insertMany: vi.fn().mockResolvedValue([
            { _id: 'mock-outbox-1' }
        ]),
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

vi.mock('../../../src/api/utils/utils.js', async (importOriginal) => {
    const original = await importOriginal() as Record<string, unknown>;
    return {
        ...original,
        process_notifications: vi.fn().mockResolvedValue(undefined),
    };
});

describe('Notification API Controller', () => {
    let app: express.Express;

    beforeAll(async () => {
        app = await createTestApp();
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('POST /api/notification', () => {
        it('should return 202 for valid email notification', async () => {
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

            const response = await request(app)
                .post('/api/notification')
                .set('Authorization', 'Bearer test-api-key')
                .send(validRequest);

            expect(response.status).toBe(202);
            expect(response.body.message).toContain('Notifications are being processed');
        });

        it('should return 401 for missing authorization header', async () => {
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
                        subject: 'Test',
                        message: 'Test',
                    },
                },
                webhook_url: 'https://webhook.example.com/callback',
            };

            const response = await request(app)
                .post('/api/notification')
                .send(validRequest);

            expect(response.status).toBe(401);
        });

        it('should return 401 for invalid API key', async () => {
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
                        subject: 'Test',
                        message: 'Test',
                    },
                },
                webhook_url: 'https://webhook.example.com/callback',
            };

            const response = await request(app)
                .post('/api/notification')
                .set('Authorization', 'Bearer wrong-api-key')
                .send(validRequest);

            expect(response.status).toBe(401);
        });

        it('should return 400 for invalid request body', async () => {
            const invalidRequest = {
                // Missing required fields
                channel: ['email'],
            };

            const response = await request(app)
                .post('/api/notification')
                .set('Authorization', 'Bearer test-api-key')
                .send(invalidRequest);

            expect(response.status).toBe(400);
            expect(response.body.errors).toBeDefined();
        });

        // Note: Email in recipient validation now happens at plugin level, not API level
    });

    describe('POST /api/notification/batch', () => {
        it('should return 202 for valid batch notification', async () => {
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

            const response = await request(app)
                .post('/api/notification/batch')
                .set('Authorization', 'Bearer test-api-key')
                .send(validRequest);

            expect(response.status).toBe(202);
        });

        it('should return 401 for missing auth on batch endpoint', async () => {
            const response = await request(app)
                .post('/api/notification/batch')
                .send({});

            expect(response.status).toBe(401);
        });

        it('should return 400 for invalid batch request', async () => {
            const invalidRequest = {
                channel: ['email'],
                // Missing required fields
            };

            const response = await request(app)
                .post('/api/notification/batch')
                .set('Authorization', 'Bearer test-api-key')
                .send(invalidRequest);

            expect(response.status).toBe(400);
        });
    });
});
