import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import settings_router from '@src/api/routes/settings.routes.js';
import { auth_middleware } from '@src/api/middlewares/auth_middleware.js';
import { dynamicConfig } from '@src/config/dynamic-config.service.js';
import { generateAdminJwt } from '@src/api/utils/jwt.utils.js';

vi.mock('@src/config/redis.config.js', () => ({
  getRedisClient: vi.fn(() => ({
    publish: vi.fn().mockResolvedValue(1),
    duplicate: vi.fn(() => ({
      status: 'ready',
      connect: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue('OK'),
      on: vi.fn(),
    })),
  })),
}));

vi.mock('@src/database/models/system-config.models.js', () => ({
  default: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
  },
}));

describe('Settings API Integration', () => {
  let app: express.Application;
  const adminToken = generateAdminJwt({ id: 'admin-1', username: 'admin' });

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/settings', auth_middleware, settings_router);
  });

  it('should reject unauthorized requests when bearer token is missing', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(401);
  });

  it('should return operational settings with valid authorization', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.settings.worker.outbox_batch_size).toBeDefined();
  });

  it('should update operational settings with valid authorization', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        worker: {
          outbox_batch_size: 150,
        },
        logging: {
          log_level: 'warn',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.settings.worker.outbox_batch_size).toBe(150);
    expect(res.body.settings.logging.log_level).toBe('warn');
  });

  it('should reject update with invalid schema bounds', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        worker: {
          outbox_batch_size: 99999, // exceeds max 2000
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('should reset operational settings to system defaults', async () => {
    const res = await request(app)
      .post('/api/settings/reset')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.settings.worker.outbox_batch_size).toBe(100);
  });
});
