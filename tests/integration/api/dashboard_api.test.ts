import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
} from 'vitest';
import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';

// Mock mongoose to support sessions without actual DB connections
vi.mock('mongoose', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    default: {
      ...actual.default,
      startSession: vi.fn().mockResolvedValue({
        startTransaction: vi.fn(),
        commitTransaction: vi.fn(),
        abortTransaction: vi.fn(),
        endSession: vi.fn(),
        withTransaction: vi.fn().mockImplementation(async (fn) => {
          await fn();
        })
      })
    }
  };
});

// Setup Mock Models
const mockNotificationFind = vi.fn();
const mockNotificationCountDocuments = vi.fn();
const mockNotificationFindById = vi.fn();
const mockNotificationFindByIdAndUpdate = vi.fn();
const mockNotificationFindByIdAndDelete = vi.fn();
const mockNotificationAggregate = vi.fn();

const mockAlertFind = vi.fn();
const mockAlertCountDocuments = vi.fn();
const mockAlertAggregate = vi.fn();
const mockAlertFindById = vi.fn();
const mockAlertFindByIdAndUpdate = vi.fn();

const mockAdminChannelFind = vi.fn();
const mockAdminChannelCreate = vi.fn();
const mockAdminChannelFindById = vi.fn();
const mockAdminChannelFindByIdAndUpdate = vi.fn();
const mockAdminChannelFindByIdAndDelete = vi.fn();

const mockOutboxCreate = vi.fn();

// Mock dependencies
vi.mock('../../../src/database/models/notification.models.js', () => ({
  default: {
    find: () => {
      const queryMock = {
        sort: () => queryMock,
        skip: () => queryMock,
        limit: () => queryMock,
        select: () => queryMock,
        lean: mockNotificationFind
      };
      return queryMock;
    },
    countDocuments: mockNotificationCountDocuments,
    findById: mockNotificationFindById,
    findByIdAndUpdate: mockNotificationFindByIdAndUpdate,
    findByIdAndDelete: mockNotificationFindByIdAndDelete,
    aggregate: mockNotificationAggregate
  }
}));

vi.mock('../../../src/database/models/alert.models.js', () => ({
  default: {
    find: () => {
      const queryMock = {
        sort: () => queryMock,
        skip: () => queryMock,
        limit: () => queryMock,
        select: () => queryMock,
        lean: mockAlertFind
      };
      return queryMock;
    },
    countDocuments: mockAlertCountDocuments,
    aggregate: mockAlertAggregate,
    findById: mockAlertFindById,
    findByIdAndUpdate: mockAlertFindByIdAndUpdate
  }
}));

vi.mock('../../../src/database/models/admin-channel.models.js', () => ({
  default: {
    find: () => {
      const queryMock = {
        sort: () => queryMock,
        skip: () => queryMock,
        limit: () => queryMock,
        select: () => queryMock,
        lean: mockAdminChannelFind
      };
      return queryMock;
    },
    create: mockAdminChannelCreate,
    findById: () => {
      const queryMock = {
        sort: () => queryMock,
        skip: () => queryMock,
        limit: () => queryMock,
        select: () => queryMock,
        lean: mockAdminChannelFindById
      };
      return queryMock;
    },
    findByIdAndUpdate: () => {
      const queryMock = {
        sort: () => queryMock,
        skip: () => queryMock,
        limit: () => queryMock,
        select: () => queryMock,
        lean: mockAdminChannelFindByIdAndUpdate
      };
      return queryMock;
    },
    findByIdAndDelete: mockAdminChannelFindByIdAndDelete
  }
}));

vi.mock('../../../src/database/models/outbox.models.js', () => ({
  default: {
    create: mockOutboxCreate
  }
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

// Mock Key Manager & Registry
vi.mock('../../../src/admin-alerts/key-manager.js', () => ({
  getOrCreateEncryptionKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 1)),
}));

vi.mock('../../../src/admin-alerts/channel-registry.js', () => ({
  hasChannelProvider: vi.fn().mockReturnValue(true),
  getChannelProvider: vi.fn().mockReturnValue({
    getCredentialSchema: () => [{ name: 'webhook_url', required: true, label: 'Webhook URL' }],
    testConnection: () => Promise.resolve({ success: true })
  }),
}));

// Express App Creator
const createTestApp = async () => {
  const app = express();
  app.use(express.json());

  // Mock Authentication Middleware
  app.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'API KEY missing' });
    }
    next();
  });

  const notificationsRouter = (await import('../../../src/api/routes/notifications-management.routes.js')).default;
  const alertsRouter = (await import('../../../src/api/routes/alerts.routes.js')).default;
  const dashboardRouter = (await import('../../../src/api/routes/dashboard.routes.js')).default;
  const adminChannelsRouter = (await import('../../../src/api/routes/admin-channels.routes.js')).default;

  app.use('/api/notifications', notificationsRouter);
  app.use('/api/alerts', alertsRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/admin-channels', adminChannelsRouter);

  return app;
};

describe('Dashboard APIs Integration Tests', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Notifications APIs', () => {
    it('GET /api/notifications should return paginated list', async () => {
      const mockList = [{
        _id: '507f1f77bcf86cd799439011',
        request_id: randomUUID(),
        client_id: randomUUID(),
        channel: 'email',
        recipient: { user_id: 'user1' },
        content: { email: { message: 'hello' } },
        webhook_url: 'http://cb.com',
        status: 'delivered',
        retry_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      }];

      mockNotificationFind.mockResolvedValueOnce(mockList);
      mockNotificationCountDocuments.mockResolvedValueOnce(1);

      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer key');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.total).toBe(1);
    });

    it('GET /api/notifications/recent should return latest activities', async () => {
      const mockList = [{
        _id: '507f1f77bcf86cd799439011',
        request_id: randomUUID(),
        client_id: randomUUID(),
        channel: 'email',
        recipient: { user_id: 'user1' },
        content: { email: { message: 'hello' } },
        webhook_url: 'http://cb.com',
        status: 'delivered',
        retry_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      }];

      mockNotificationFind.mockResolvedValueOnce(mockList);

      const res = await request(app)
        .get('/api/notifications/recent')
        .set('Authorization', 'Bearer key');

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
    });

    it('GET /api/notifications/:id should return single notification', async () => {
      const mockDoc = {
        _id: '507f1f77bcf86cd799439011',
        request_id: randomUUID(),
        client_id: randomUUID(),
        channel: 'email',
        recipient: { user_id: 'user1' },
        content: { email: { message: 'hello' } },
        webhook_url: 'http://cb.com',
        status: 'delivered',
        retry_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockNotificationFindById.mockReturnValueOnce({
        lean: () => Promise.resolve(mockDoc)
      });

      const res = await request(app)
        .get('/api/notifications/507f1f77bcf86cd799439011')
        .set('Authorization', 'Bearer key');

      expect(res.status).toBe(200);
      expect(res.body._id).toBe('507f1f77bcf86cd799439011');
    });

    it('DELETE /api/notifications/:id should hard delete notification', async () => {
      mockNotificationFindByIdAndDelete.mockResolvedValueOnce({ _id: '507f1f77bcf86cd799439011' });

      const res = await request(app)
        .delete('/api/notifications/507f1f77bcf86cd799439011')
        .set('Authorization', 'Bearer key');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('POST /api/notifications/:id/retry should re-queue failed notification', async () => {
      const mockDoc = {
        _id: '507f1f77bcf86cd799439011',
        request_id: randomUUID(),
        client_id: randomUUID(),
        channel: 'email',
        recipient: { user_id: 'user1' },
        content: { email: { message: 'hello' } },
        webhook_url: 'http://cb.com',
        status: 'failed',
        retry_count: 1,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockNotificationFindById.mockResolvedValueOnce(mockDoc);
      mockNotificationFindByIdAndUpdate.mockResolvedValueOnce({ ...mockDoc, status: 'pending' });

      const res = await request(app)
        .post('/api/notifications/507f1f77bcf86cd799439011/retry')
        .set('Authorization', 'Bearer key');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Alerts APIs', () => {
    it('GET /api/alerts should return unresolved alerts', async () => {
      mockAlertFind.mockResolvedValueOnce([{ _id: 'alert-1', resolved: false }]);
      mockAlertCountDocuments.mockResolvedValueOnce(1);
      mockAlertAggregate.mockResolvedValueOnce([{ _id: 'stuck_processing', count: 1 }]);

      const res = await request(app)
        .get('/api/alerts')
        .set('Authorization', 'Bearer key');

      expect(res.status).toBe(200);
      expect(res.body.alerts.length).toBe(1);
      expect(res.body.byType.stuck_processing).toBe(1);
    });

    it('DELETE /api/alerts/:id should dismiss alert', async () => {
      mockAlertFindByIdAndUpdate.mockResolvedValueOnce({ _id: 'alert-1', resolved: true });

      const res = await request(app)
        .delete('/api/alerts/507f1f77bcf86cd799439011')
        .set('Authorization', 'Bearer key');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('POST /api/alerts/:id/resolve should resolve and retry', async () => {
      const mockAlert = {
        _id: 'alert-1',
        notification_id: '507f1f77bcf86cd799439011',
        resolved: false,
        save: vi.fn().mockResolvedValue(true)
      };

      const mockNotification = {
        _id: '507f1f77bcf86cd799439011',
        request_id: randomUUID(),
        client_id: randomUUID(),
        channel: 'email',
        recipient: { user_id: 'user1' },
        content: { email: { message: 'hello' } },
        webhook_url: 'http://cb.com',
        status: 'failed',
        retry_count: 1,
        save: vi.fn().mockResolvedValue(true),
        markModified: vi.fn()
      };

      mockAlertFindById.mockResolvedValueOnce(mockAlert);
      mockNotificationFindById.mockResolvedValueOnce(mockNotification);

      const res = await request(app)
        .post('/api/alerts/507f1f77bcf86cd799439011/resolve')
        .set('Authorization', 'Bearer key')
        .send({ appendWarning: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Admin Channels APIs', () => {
    it('GET /api/admin-channels should list channels', async () => {
      mockAdminChannelFind.mockResolvedValueOnce([{ _id: 'channel-1', name: 'Discord' }]);

      const res = await request(app)
        .get('/api/admin-channels')
        .set('Authorization', 'Bearer key');

      expect(res.status).toBe(200);
      expect(res.body.channels.length).toBe(1);
    });

    it('POST /api/admin-channels should create channel', async () => {
      mockAdminChannelCreate.mockResolvedValueOnce({
        toObject: () => ({ _id: 'channel-1', name: 'Slack' })
      });

      const res = await request(app)
        .post('/api/admin-channels')
        .set('Authorization', 'Bearer key')
        .send({
          channel_type: 'slack',
          name: 'Slack Alerts',
          config: { webhook_url: 'https://slack.com/hook' }
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.channel.name).toBe('Slack');
    });

    it('DELETE /api/admin-channels/:id should delete channel', async () => {
      mockAdminChannelFindByIdAndDelete.mockResolvedValueOnce({ _id: 'channel-1' });

      const res = await request(app)
        .delete('/api/admin-channels/507f1f77bcf86cd799439011')
        .set('Authorization', 'Bearer key');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Dashboard Analytics APIs', () => {
    it('GET /api/dashboard/stats should return stats', async () => {
      mockNotificationAggregate
        .mockResolvedValueOnce([{ _id: null, total: 2, pending: 1, failed: 1 }]) // status stats
        .mockResolvedValueOnce([{ _id: 'email', count: 2 }]); // channel stats

      const res = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', 'Bearer key');

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.byChannel.email).toBe(2);
    });

    it('GET /api/dashboard/trends should return trends', async () => {
      mockNotificationAggregate.mockResolvedValueOnce([
        { _id: { time: 10, status: 'delivered' }, count: 5 }
      ]);

      const res = await request(app)
        .get('/api/dashboard/trends')
        .set('Authorization', 'Bearer key');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.period).toBe('24h');
    });
  });
});
