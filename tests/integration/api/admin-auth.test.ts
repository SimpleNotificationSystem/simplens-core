import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import admin_auth_router from '@src/api/routes/admin-auth.routes.js';
import system_config_model from '@src/database/models/system-config.models.js';

vi.mock('@src/database/models/system-config.models.js', () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

describe('Admin Auth Routes Integration', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/admin/auth', admin_auth_router);
  });

  describe('GET /api/admin/auth/status', () => {
    it('should return isConfigured: false when no credentials exist in database', async () => {
      vi.mocked(system_config_model.findOne).mockResolvedValue(null);

      const res = await request(app).get('/api/admin/auth/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ isConfigured: false });
    });

    it('should return isConfigured: true when credentials exist in database', async () => {
      vi.mocked(system_config_model.findOne).mockResolvedValue({
        key: 'admin_credentials',
        value: { username: 'admin' },
      } as any);

      const res = await request(app).get('/api/admin/auth/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ isConfigured: true });
    });
  });

  describe('POST /api/admin/auth/setup', () => {
    it('should reject setup with validation error if password too short', async () => {
      const res = await request(app)
        .post('/api/admin/auth/setup')
        .send({ username: 'admin', password: '123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should reject setup with validation error if password exceeds max length', async () => {
      const res = await request(app)
        .post('/api/admin/auth/setup')
        .send({ username: 'admin', password: 'a'.repeat(65) });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should reject setup if already configured', async () => {
      vi.mocked(system_config_model.findOne).mockResolvedValue({
        key: 'admin_credentials',
        value: { username: 'admin' },
      } as any);

      const res = await request(app)
        .post('/api/admin/auth/setup')
        .send({ username: 'admin', password: 'supersecretpassword123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('already been configured');
    });

    it('should successfully configure admin and return 201', async () => {
      vi.mocked(system_config_model.findOne).mockResolvedValue(null);
      vi.mocked(system_config_model.create).mockResolvedValue({} as any);

      const res = await request(app)
        .post('/api/admin/auth/setup')
        .send({ username: 'superuser', password: 'supersecretpassword123' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.user.username).toBe('superuser');
      expect(system_config_model.create).toHaveBeenCalled();
    });
  });

  describe('POST /api/admin/auth/verify', () => {
    it('should reject invalid credentials', async () => {
      vi.mocked(system_config_model.findOne).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/admin/auth/verify')
        .send({ username: 'wrong', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.isValid).toBe(false);
    });
  });
});
