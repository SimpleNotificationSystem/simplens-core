import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import pluginsRouter from '../../../src/api/routes/plugins.routes.js';
import { PluginManagerService, NpmAuthService } from '../../../src/plugins/index.js';

vi.mock('../../../src/plugins/index.js', () => ({
  PluginRegistry: {
    isInitialized: vi.fn(() => true),
    getPluginMetadata: vi.fn(() => ({
      channels: ['email'],
      providers: {
        email: [
          {
            name: 'resend',
            package: '@simplens/resend',
            version: '1.0.0',
            channel: 'email',
          },
        ],
      },
      counts: { channels: 1, providers: 1 },
    })),
  },
  PluginManagerService: {
    listInstalledPlugins: vi.fn(),
    installPlugin: vi.fn(),
    changePluginVersion: vi.fn(),
    uninstallPlugin: vi.fn(),
  },
  NpmAuthService: {
    getAuthStatus: vi.fn(),
    saveNpmAuth: vi.fn(),
    deleteNpmAuth: vi.fn(),
  },
}));

describe('Plugins API Integration', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/plugins', pluginsRouter);
  });

  describe('GET /api/plugins/npm-auth', () => {
    it('should return npm auth status', async () => {
      vi.mocked(NpmAuthService.getAuthStatus).mockResolvedValue({
        configured: true,
        masked_token: 'npm_****cdef',
        registry_url: 'https://registry.npmjs.org/',
      });

      const res = await request(app).get('/api/plugins/npm-auth');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        configured: true,
        masked_token: 'npm_****cdef',
        registry_url: 'https://registry.npmjs.org/',
      });
      expect(NpmAuthService.getAuthStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /api/plugins/npm-auth', () => {
    it('should save npm auth configuration with valid payload', async () => {
      vi.mocked(NpmAuthService.saveNpmAuth).mockResolvedValue({
        configured: true,
        masked_token: 'npm_****7890',
        registry_url: 'https://registry.npmjs.org/',
      });

      const res = await request(app)
        .post('/api/plugins/npm-auth')
        .send({
          token: 'npm_1234567890',
          registry_url: 'https://registry.npmjs.org/',
        });

      expect(res.status).toBe(200);
      expect(res.body.status.configured).toBe(true);
      expect(NpmAuthService.saveNpmAuth).toHaveBeenCalledWith(
        'npm_1234567890',
        'https://registry.npmjs.org/'
      );
    });

    it('should reject invalid payload when token is empty', async () => {
      const res = await request(app)
        .post('/api/plugins/npm-auth')
        .send({
          token: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.details).toBeDefined();
    });
  });

  describe('DELETE /api/plugins/npm-auth', () => {
    it('should delete npm auth configuration', async () => {
      vi.mocked(NpmAuthService.deleteNpmAuth).mockResolvedValue(undefined);

      const res = await request(app).delete('/api/plugins/npm-auth');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('removed successfully');
      expect(NpmAuthService.deleteNpmAuth).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /api/plugins/install', () => {
    it('should install plugin successfully without auth', async () => {
      const mockPlugin = {
        name: 'custom-email',
        package: '@myorg/custom-email',
        version: '1.0.0',
        channel: 'email',
        status: 'installed',
        installed_at: new Date().toISOString(),
      };
      vi.mocked(PluginManagerService.installPlugin).mockResolvedValue(mockPlugin as any);

      const res = await request(app)
        .post('/api/plugins/install')
        .send({
          package: '@myorg/custom-email',
          version: '1.0.0',
        });

      expect(res.status).toBe(201);
      expect(res.body.plugin).toEqual(mockPlugin);
      expect(PluginManagerService.installPlugin).toHaveBeenCalledWith(
        '@myorg/custom-email',
        '1.0.0',
        undefined
      );
    });

    it('should install private plugin with auth credentials provided', async () => {
      const mockPlugin = {
        name: 'private-slack',
        package: '@enterprise/simplens-slack',
        version: '2.0.0',
        channel: 'slack',
        status: 'installed',
        installed_at: new Date().toISOString(),
      };
      vi.mocked(PluginManagerService.installPlugin).mockResolvedValue(mockPlugin as any);

      const res = await request(app)
        .post('/api/plugins/install')
        .send({
          package: '@enterprise/simplens-slack',
          version: '2.0.0',
          auth: {
            token: 'npm_secret_enterprise_token',
          },
        });

      expect(res.status).toBe(201);
      expect(PluginManagerService.installPlugin).toHaveBeenCalledWith(
        '@enterprise/simplens-slack',
        '2.0.0',
        { token: 'npm_secret_enterprise_token', save_token: true }
      );
    });

    it('should return 400 when package name is missing', async () => {
      const res = await request(app)
        .post('/api/plugins/install')
        .send({
          version: '1.0.0',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toContain('Invalid plugin installation payload');
    });

    it('should return 400 when package is not a valid SimpleNS plugin', async () => {
      vi.mocked(PluginManagerService.installPlugin).mockRejectedValue(
        new Error("Package 'lodash' is not a valid SimpleNS plugin: Missing required provider methods: send, initialize")
      );

      const res = await request(app)
        .post('/api/plugins/install')
        .send({
          package: 'lodash',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toContain('not a valid SimpleNS plugin');
    });

    it('should return 400 when private package npm authentication fails', async () => {
      vi.mocked(PluginManagerService.installPlugin).mockRejectedValue(
        new Error("npm authentication failed (401/403) while installing '@private/pkg'. Configure npm auth token first.")
      );

      const res = await request(app)
        .post('/api/plugins/install')
        .send({
          package: '@private/pkg',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toContain('npm authentication failed');
    });
  });

  describe('GET /api/plugins/installed', () => {
    it('should return list of installed plugins', async () => {
      vi.mocked(PluginManagerService.listInstalledPlugins).mockResolvedValue([
        {
          name: 'resend',
          package: '@simplens/resend',
          version: '1.0.0',
          channel: 'email',
          status: 'installed',
        } as any,
      ]);

      const res = await request(app).get('/api/plugins/installed');

      expect(res.status).toBe(200);
      expect(res.body.plugins).toHaveLength(1);
      expect(res.body.plugins[0].package).toBe('@simplens/resend');
    });
  });

  describe('DELETE /api/plugins/:package', () => {
    it('should uninstall a plugin', async () => {
      vi.mocked(PluginManagerService.uninstallPlugin).mockResolvedValue(undefined);

      const res = await request(app).delete('/api/plugins/@simplens/resend');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('uninstalled successfully');
      expect(PluginManagerService.uninstallPlugin).toHaveBeenCalledWith('@simplens/resend');
    });
  });
});
