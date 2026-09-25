/**
 * Integration tests for API Key Management and Usage Tracking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import api_keys_router from '@src/api/routes/api-key.routes.js';
import notification_router from '@src/api/routes/notification.routes.js';
import admin_auth_router from '@src/api/routes/admin-auth.routes.js';
import { auth_middleware } from '@src/api/middlewares/auth_middleware.js';
import api_key_model from '@src/database/models/api-key.models.js';
import notification_model from '@src/database/models/notification.models.js';
import system_config_model from '@src/database/models/system-config.models.js';
import { generateAdminJwt } from '@src/api/utils/jwt.utils.js';

// Mock models
vi.mock('@src/database/models/api-key.models.js', () => {
    let mockKeys: any[] = [];
    return {
        default: {
            find: vi.fn(() => ({
                sort: vi.fn().mockImplementation(() => Promise.resolve(mockKeys)),
            })),
            findOne: vi.fn((query: any) => {
                if (query.key_hash) {
                    const match = mockKeys.find(k => k.key_hash === query.key_hash && (!query.status || k.status === query.status));
                    return Promise.resolve(match ? { ...match, toObject: () => ({ ...match }) } : null);
                }
                if (query.key_id) {
                    const match = mockKeys.find(k => k.key_id === query.key_id);
                    return Promise.resolve(match ? { ...match, toObject: () => ({ ...match }) } : null);
                }
                return Promise.resolve(null);
            }),
            create: vi.fn((data: any) => {
                const doc = {
                    ...data,
                    created_at: new Date(),
                    updated_at: new Date(),
                    toObject: () => ({ ...data, created_at: new Date(), updated_at: new Date() }),
                };
                mockKeys.push(doc);
                return Promise.resolve(doc);
            }),
            findOneAndUpdate: vi.fn((query: any, update: any) => {
                const match = mockKeys.find(k => k.key_id === query.key_id);
                if (!match) return Promise.resolve(null);
                if (update.$set) {
                    Object.assign(match, update.$set);
                }
                return Promise.resolve({ ...match, toObject: () => ({ ...match }) });
            }),
            updateOne: vi.fn((query: any, update: any) => {
                const match = mockKeys.find(k => k.key_id === query.key_id);
                if (match) {
                    if (update.$inc) {
                        for (const [field, val] of Object.entries(update.$inc)) {
                            if (field.startsWith('usage.by_channel.')) {
                                const ch = field.replace('usage.by_channel.', '');
                                match.usage.by_channel[ch] = (match.usage.by_channel[ch] || 0) + (val as number);
                            } else if (field === 'usage.total_notifications') {
                                match.usage.total_notifications = (match.usage.total_notifications || 0) + (val as number);
                            } else if (field === 'usage.total_requests') {
                                match.usage.total_requests = (match.usage.total_requests || 0) + (val as number);
                            }
                        }
                    }
                    if (update.$set) {
                        Object.assign(match, update.$set);
                    }
                }
                return Promise.resolve({ modifiedCount: match ? 1 : 0 });
            }),
            deleteOne: vi.fn((query: any) => {
                const idx = mockKeys.findIndex(k => k.key_id === query.key_id);
                if (idx >= 0) {
                    mockKeys.splice(idx, 1);
                    return Promise.resolve({ deletedCount: 1 });
                }
                return Promise.resolve({ deletedCount: 0 });
            }),
            __resetMockKeys: () => {
                mockKeys = [];
            },
            __getMockKeys: () => mockKeys,
        },
    };
});

vi.mock('@src/database/models/notification.models.js', () => ({
    default: {
        aggregate: vi.fn().mockResolvedValue([
            { _id: 'delivered', count: 10 },
            { _id: 'failed', count: 2 },
        ]),
        findOne: vi.fn().mockResolvedValue(null),
        insertMany: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('@src/database/models/outbox.models.js', () => ({
    default: {
        insertMany: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('@src/database/models/system-config.models.js', () => ({
    default: {
        findOne: vi.fn().mockResolvedValue({ key: 'admin_credentials', value: { username: 'admin' } }),
    },
}));

vi.mock('@src/plugins/index.js', () => {
    const mockProviderInstance = {
        getContentSchema: () => ({
            safeParse: () => ({ success: true, data: {} }),
        }),
    };

    return {
        PluginRegistry: {
            getProvider: vi.fn().mockReturnValue(mockProviderInstance),
            get: vi.fn().mockReturnValue(mockProviderInstance),
            getDefaultProvider: vi.fn().mockReturnValue(mockProviderInstance),
            hasChannel: vi.fn().mockReturnValue(true),
            getChannelProviders: vi.fn().mockReturnValue(['mock-provider']),
        },
    };
});

vi.mock('@src/api/utils/utils.js', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        process_notifications: vi.fn().mockResolvedValue({
            created_count: 1,
            notification_ids: ['507f1f77bcf86cd799439011'],
            duplicate_count: 0,
        }),
    };
});

describe('API Keys Integration & Usage Tracking', () => {
    let app: express.Application;
    let adminToken: string;

    beforeEach(() => {
        vi.clearAllMocks();
        (api_key_model as any).__resetMockKeys();

        adminToken = generateAdminJwt({ id: 'admin-1', username: 'admin' });

        app = express();
        app.use(express.json());
        app.use('/api/keys', auth_middleware, api_keys_router);
        app.use('/api/notification', auth_middleware, notification_router);
        app.use('/api/admin/auth', auth_middleware, admin_auth_router);
    });

    describe('API Key Management CRUD', () => {
        it('should reject unauthenticated access to /api/keys', async () => {
            const res = await request(app).get('/api/keys');
            expect(res.status).toBe(401);
        });

        it('should create an API key when authenticated with Admin JWT', async () => {
            const res = await request(app)
                .post('/api/keys')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Payment Webhooks' });

            expect(res.status).toBe(201);
            expect(res.body.key).toBeDefined();
            expect(res.body.key.name).toBe('Payment Webhooks');
            expect(res.body.key.key_prefix).toMatch(/^sns_live_/);
            expect(res.body.raw_key).toMatch(/^sns_live_/);
            expect(res.body.key.status).toBe('active');
        });

        it('should list API keys without exposing key_hash or raw key', async () => {
            await request(app)
                .post('/api/keys')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Service Alpha' });

            const res = await request(app)
                .get('/api/keys')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.keys).toHaveLength(1);
            expect(res.body.keys[0].name).toBe('Service Alpha');
            expect(res.body.keys[0].key_hash).toBeUndefined();
            expect(res.body.keys[0].raw_key).toBeUndefined();
            expect(res.body.keys[0].key_prefix).toBeDefined();
        });

        it('should get API key usage and delivery breakdown', async () => {
            const createRes = await request(app)
                .post('/api/keys')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Analytics Key' });

            const keyId = createRes.body.key.key_id;

            const res = await request(app)
                .get(`/api/keys/${keyId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.key.key_id).toBe(keyId);
            expect(res.body.status_breakdown).toEqual({
                delivered: 10,
                failed: 2,
                pending: 0,
                processing: 0,
            });
        });

        it('should revoke an API key', async () => {
            const createRes = await request(app)
                .post('/api/keys')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Temporary Worker' });

            const keyId = createRes.body.key.key_id;

            const revokeRes = await request(app)
                .post(`/api/keys/${keyId}/revoke`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(revokeRes.status).toBe(200);
            expect(revokeRes.body.success).toBe(true);
            expect(revokeRes.body.key.status).toBe('revoked');
        });

        it('should delete an API key', async () => {
            const createRes = await request(app)
                .post('/api/keys')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Obsolete Key' });

            const keyId = createRes.body.key.key_id;

            const deleteRes = await request(app)
                .delete(`/api/keys/${keyId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(deleteRes.status).toBe(200);
            expect(deleteRes.body.success).toBe(true);

            const getRes = await request(app)
                .get(`/api/keys/${keyId}`)
                .set('Authorization', `Bearer ${adminToken}`);
            expect(getRes.status).toBe(404);
        });
    });

    describe('External Services Authentication & Usage Tracking', () => {
        it('should authenticate external notification request via generated API key', async () => {
            const createRes = await request(app)
                .post('/api/keys')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Order Notification Service' });

            const rawKey = createRes.body.raw_key;
            expect(rawKey).toBeDefined();

            // Send notification using the generated API key
            const notifPayload = {
                request_id: crypto.randomUUID(),
                client_id: crypto.randomUUID(),
                channel: ['email'],
                recipient: { email: 'customer@example.com' },
                content: { email: { subject: 'Receipt', message: 'Order paid' } },
                webhook_url: 'https://webhook.site/test',
            };

            const notifRes = await request(app)
                .post('/api/notification')
                .set('Authorization', `Bearer ${rawKey}`)
                .send(notifPayload);

            expect(notifRes.status).toBe(202);

            // Verify usage tracking incremented
            const keys = (api_key_model as any).__getMockKeys();
            const usedKey = keys[0];
            expect(usedKey.usage.total_notifications).toBeGreaterThanOrEqual(1);
            expect(usedKey.usage.by_channel['email']).toBeGreaterThanOrEqual(1);
        });

        it('should reject requests made with a revoked API key', async () => {
            const createRes = await request(app)
                .post('/api/keys')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'To Be Revoked' });

            const keyId = createRes.body.key.key_id;
            const rawKey = createRes.body.raw_key;

            // Revoke it
            await request(app)
                .post(`/api/keys/${keyId}/revoke`)
                .set('Authorization', `Bearer ${adminToken}`);

            // Attempt to send notification
            const notifRes = await request(app)
                .post('/api/notification')
                .set('Authorization', `Bearer ${rawKey}`)
                .send({
                    request_id: crypto.randomUUID(),
                    client_id: crypto.randomUUID(),
                    channel: ['email'],
                    recipient: { email: 'customer@example.com' },
                    content: { email: { subject: 'Receipt', message: 'Order paid' } },
                    webhook_url: 'https://webhook.site/test',
                });

            expect(notifRes.status).toBe(401);
        });

        it('should forbid API keys from accessing admin credential setup or verify routes', async () => {
            const createRes = await request(app)
                .post('/api/keys')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'External Key' });

            const rawKey = createRes.body.raw_key;

            const setupRes = await request(app)
                .post('/api/admin/auth/setup')
                .set('Authorization', `Bearer ${rawKey}`)
                .send({ username: 'hacker', password: 'password123' });

            expect(setupRes.status).toBe(403);
            expect(setupRes.body.error).toContain('cannot access administrator credential');
        });

        it('should allow API keys to access /api/admin/auth/status for MCP server compatibility', async () => {
            const createRes = await request(app)
                .post('/api/keys')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'MCP Server Key' });

            const rawKey = createRes.body.raw_key;

            const statusRes = await request(app)
                .get('/api/admin/auth/status')
                .set('Authorization', `Bearer ${rawKey}`);

            expect(statusRes.status).toBe(200);
            expect(statusRes.body.isConfigured).toBe(true);
        });
    });
});
