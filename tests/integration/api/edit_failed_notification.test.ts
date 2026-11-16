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
import z from 'zod';

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

const mockNotificationFindById = vi.fn();
const mockNotificationFindByIdAndUpdate = vi.fn();
const mockTemplateFindOne = vi.fn();
const mockOutboxCreate = vi.fn();

vi.mock('../../../src/database/models/notification.models.js', () => ({
  default: {
    findById: mockNotificationFindById,
    findByIdAndUpdate: mockNotificationFindByIdAndUpdate,
  }
}));

vi.mock('../../../src/database/models/notification-template.models.js', () => ({
  default: {
    findOne: mockTemplateFindOne,
  }
}));

vi.mock('../../../src/database/models/outbox.models.js', () => ({
  default: {
    create: mockOutboxCreate,
  }
}));

vi.mock('../../../src/workers/utils/logger.js', () => ({
  apiLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
  }
}));

// Mock PluginRegistry
const mockProviderEmail = {
  manifest: {
    name: '@simplens/email-nodemailer',
    channel: 'email',
    displayName: 'Nodemailer Email',
    fileAttachment: {
      enabled: true,
      maxFileSize: 10485760,
      maxCount: 5,
    }
  },
  getRecipientSchema: () => z.object({
    email: z.string().email(),
  }),
  getContentSchema: () => z.object({
    subject: z.string().min(1),
    message: z.string().min(1),
    priority: z.enum(['low', 'normal', 'high']).optional(),
    sender: z.object({
      name: z.string().optional(),
      reply_to: z.string().email().optional(),
    }).optional(),
    attachments: z.array(z.any()).optional(),
  }),
  getFileAttachmentConfig: () => ({
    enabled: true,
    maxFileSize: 10485760,
    maxCount: 5,
  })
};

const mockProviderNoAttachment = {
  manifest: {
    name: '@simplens/sms-twilio',
    channel: 'sms',
    displayName: 'Twilio SMS',
    fileAttachment: {
      enabled: false,
    }
  },
  getRecipientSchema: () => z.object({
    phone: z.string().min(10),
  }),
  getContentSchema: () => z.object({
    message: z.string().min(1),
    attachments: z.array(z.any()).optional(),
  }),
  getFileAttachmentConfig: () => ({
    enabled: false,
  })
};

vi.mock('../../../src/plugins/index.js', () => ({
  PluginRegistry: {
    has: vi.fn((id: string) => id === 'nodemailer-1' || id === 'twilio-1'),
    get: vi.fn((id: string) => {
      if (id === 'nodemailer-1') return mockProviderEmail;
      if (id === 'twilio-1') return mockProviderNoAttachment;
      return undefined;
    }),
    getDefaultProvider: vi.fn((channel: string) => {
      if (channel === 'email') return mockProviderEmail;
      if (channel === 'sms') return mockProviderNoAttachment;
      return undefined;
    }),
    getDefaultProviderId: vi.fn((channel: string) => {
      if (channel === 'email') return 'nodemailer-1';
      if (channel === 'sms') return 'twilio-1';
      return undefined;
    }),
    getRegistered: vi.fn(() => ({ options: {} })),
  }
}));

const createTestApp = async () => {
  const app = express();
  app.use(express.json());

  const notificationsRouter = (await import('../../../src/api/routes/notifications-management.routes.js')).default;
  app.use('/api/notifications', notificationsRouter);

  return app;
};

describe('PUT /api/notifications/:id (Edit and Requeue Failed Notification)', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validId = '507f1f77bcf86cd799439011';

  const createMockFailedDoc = (channel = 'email') => ({
    _id: validId,
    request_id: randomUUID(),
    client_id: randomUUID(),
    channel,
    provider: channel === 'email' ? 'nodemailer-1' : 'twilio-1',
    recipient: channel === 'email' ? { email: 'old@example.com' } : { phone: '1234567890' },
    content: channel === 'email' ? { subject: 'Old Subject', message: 'Old Message' } : { message: 'Old SMS' },
    webhook_url: 'https://webhook.site/test',
    status: 'failed',
    retry_count: 3,
    error_message: 'Previous connection timeout',
    created_at: new Date(),
    updated_at: new Date(),
    toObject() {
      return { ...this };
    }
  });

  it('should return 400 for invalid ObjectId', async () => {
    const res = await request(app)
      .put('/api/notifications/invalid-id')
      .send({ content: { subject: 'Sub', message: 'Msg' } });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid ID');
  });

  it('should return 404 if notification is not found', async () => {
    mockNotificationFindById.mockResolvedValueOnce(null);

    const res = await request(app)
      .put(`/api/notifications/${validId}`)
      .send({ content: { subject: 'Sub', message: 'Msg' } });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Notification not found');
  });

  it('should return 400 if notification status is not failed', async () => {
    const mockDoc = { ...createMockFailedDoc(), status: 'delivered' };
    mockNotificationFindById.mockResolvedValueOnce(mockDoc);

    const res = await request(app)
      .put(`/api/notifications/${validId}`)
      .send({ content: { subject: 'Sub', message: 'Msg' } });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Only failed notifications can be edited and requeued');
  });

  it('should reject uneditable / blocked fields with 400', async () => {
    const mockDoc = createMockFailedDoc();
    mockNotificationFindById.mockResolvedValueOnce(mockDoc);

    const res = await request(app)
      .put(`/api/notifications/${validId}`)
      .send({
        content: { subject: 'Sub', message: 'Msg' },
        status: 'pending', // BLOCKED
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('should reject client attempt to pass retry_count with 400', async () => {
    const mockDoc = createMockFailedDoc();
    mockNotificationFindById.mockResolvedValueOnce(mockDoc);

    const res = await request(app)
      .put(`/api/notifications/${validId}`)
      .send({
        content: { subject: 'Sub', message: 'Msg' },
        retry_count: 5, // BLOCKED
      });

    expect(res.status).toBe(400);
  });

  it('should return 400 if provider is invalid for channel', async () => {
    const mockDoc = createMockFailedDoc('email');
    mockNotificationFindById.mockResolvedValueOnce(mockDoc);

    const res = await request(app)
      .put(`/api/notifications/${validId}`)
      .send({
        provider: 'twilio-1', // twilio-1 is for SMS channel, not email!
        content: { subject: 'Sub', message: 'Msg' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("is not a valid provider for channel 'email'");
  });

  it('should return 400 if template_id does not exist', async () => {
    const mockDoc = createMockFailedDoc('email');
    mockNotificationFindById.mockResolvedValueOnce(mockDoc);
    mockTemplateFindOne.mockResolvedValueOnce(null);

    const res = await request(app)
      .put(`/api/notifications/${validId}`)
      .send({
        template_id: 'missing-template',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Template not found');
  });

  it('should return 400 if template package does not match provider', async () => {
    const mockDoc = createMockFailedDoc('email');
    mockNotificationFindById.mockResolvedValueOnce(mockDoc);
    mockTemplateFindOne.mockResolvedValueOnce({
      template_id: 'tpl-1',
      package: '@simplens/some-other-package', // does not match @simplens/email-nodemailer
      content: { subject: 'Sub', message: 'Msg' },
    });

    const res = await request(app)
      .put(`/api/notifications/${validId}`)
      .send({
        template_id: 'tpl-1',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('does not match provider');
  });

  it('should return 400 if recipient fails provider schema', async () => {
    const mockDoc = createMockFailedDoc('email');
    mockNotificationFindById.mockResolvedValueOnce(mockDoc);

    const res = await request(app)
      .put(`/api/notifications/${validId}`)
      .send({
        recipient: { email: 'not-an-email' }, // fails email validation
        content: { subject: 'Sub', message: 'Msg' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Recipient validation failed');
  });

  it('should return 400 if content fails provider schema', async () => {
    const mockDoc = createMockFailedDoc('email');
    mockNotificationFindById.mockResolvedValueOnce(mockDoc);

    const res = await request(app)
      .put(`/api/notifications/${validId}`)
      .send({
        content: { subject: '' }, // missing message and empty subject
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Content validation failed');
  });

  it('should return 400 if attachments are added to a provider that has file attachments disabled', async () => {
    const mockDoc = createMockFailedDoc('sms');
    mockNotificationFindById.mockResolvedValueOnce(mockDoc);

    const res = await request(app)
      .put(`/api/notifications/${validId}`)
      .send({
        recipient: { phone: '1234567890' },
        content: {
          message: 'Hello SMS',
          attachments: [{ id: 'file-1', filename: 'test.pdf' }],
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('File attachments are disabled or not supported');
  });

  it('should successfully edit failed notification, replace content with template, reset retry_count to 0, and enqueue into outbox', async () => {
    const mockDoc = createMockFailedDoc('email');
    mockNotificationFindById.mockResolvedValueOnce(mockDoc);
    mockTemplateFindOne.mockResolvedValueOnce({
      template_id: 'tpl-valid',
      package: '@simplens/email-nodemailer',
      content: { subject: 'Templated Subject', message: 'Templated Message' },
    });

    const updatedDoc = {
      ...mockDoc,
      status: 'pending',
      retry_count: 0,
      error_message: null,
      content: { subject: 'Templated Subject', message: 'Templated Message' },
      toObject() {
        return { ...this };
      }
    };
    mockNotificationFindByIdAndUpdate.mockResolvedValueOnce(updatedDoc);

    const res = await request(app)
      .put(`/api/notifications/${validId}`)
      .send({
        template_id: 'tpl-valid',
        // Also passing content to verify template replaces content
        content: { subject: 'Ignored Subject', message: 'Ignored Message' },
        recipient: { email: 'newrecipient@example.com' },
        variables: { name: 'Alice' },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify DB update called with retry_count: 0 and status: pending
    expect(mockNotificationFindByIdAndUpdate).toHaveBeenCalledWith(
      validId,
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'pending',
          retry_count: 0,
          error_message: null,
          recipient: { email: 'newrecipient@example.com' },
          content: { subject: 'Templated Subject', message: 'Templated Message' },
          variables: { name: 'Alice' },
        })
      }),
      expect.any(Object)
    );

    // Verify outbox entry created with payload having retry_count: 0
    expect(mockOutboxCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'pending',
          payload: expect.objectContaining({
            retry_count: 0,
            content: { subject: 'Templated Subject', message: 'Templated Message' },
          })
        })
      ]),
      expect.any(Object)
    );
  });

  it('should successfully edit with manual content and unset provider (reverting to channel default)', async () => {
    const mockDoc = createMockFailedDoc('email');
    mockNotificationFindById.mockResolvedValueOnce(mockDoc);

    const updatedDoc = {
      ...mockDoc,
      provider: undefined,
      status: 'pending',
      retry_count: 0,
      error_message: null,
      content: { subject: 'Manual Subject', message: 'Manual Message' },
      toObject() {
        return { ...this };
      }
    };
    mockNotificationFindByIdAndUpdate.mockResolvedValueOnce(updatedDoc);

    const res = await request(app)
      .put(`/api/notifications/${validId}`)
      .send({
        provider: null, // unset provider
        recipient: { email: 'manual@example.com' },
        content: { subject: 'Manual Subject', message: 'Manual Message' },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockNotificationFindByIdAndUpdate).toHaveBeenCalledWith(
      validId,
      expect.objectContaining({
        $unset: expect.objectContaining({ provider: 1 })
      }),
      expect.any(Object)
    );
  });

  it('should prune empty strings and nested empty objects from optional fields so validation succeeds', async () => {
    const mockDoc = createMockFailedDoc('email');
    mockNotificationFindById.mockResolvedValueOnce(mockDoc);

    const updatedDoc = {
      ...mockDoc,
      status: 'pending',
      retry_count: 0,
      content: { subject: 'Valid Subject', message: 'Valid Message' },
      toObject() {
        return { ...this };
      }
    };
    mockNotificationFindByIdAndUpdate.mockResolvedValueOnce(updatedDoc);

    const res = await request(app)
      .put(`/api/notifications/${validId}`)
      .send({
        recipient: { email: 'test@example.com' },
        content: {
          subject: 'Valid Subject',
          message: 'Valid Message',
          priority: '', // Empty string for optional enum
          sender: {
            name: '',
            reply_to: '', // Empty string for optional email
          },
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify pruned content was passed to findByIdAndUpdate
    expect(mockNotificationFindByIdAndUpdate).toHaveBeenCalledWith(
      validId,
      expect.objectContaining({
        $set: expect.objectContaining({
          content: { subject: 'Valid Subject', message: 'Valid Message' }
        })
      }),
      expect.any(Object)
    );
  });

  it('should remove attachments from content when attachments are cleared in edit payload', async () => {
    const mockDoc = {
      ...createMockFailedDoc('email'),
      content: {
        subject: 'Previous Subject',
        message: 'Previous Message',
        attachments: [
          {
            id: 'file-123',
            name: 'receipt.pdf',
            size: 1024,
            mime_type: 'application/pdf',
            url: 'http://storage/file-123'
          }
        ]
      }
    };
    mockNotificationFindById.mockResolvedValueOnce(mockDoc);

    const updatedDoc = {
      ...mockDoc,
      status: 'pending',
      retry_count: 0,
      content: { subject: 'Updated Subject', message: 'Updated Message' },
      toObject() {
        return { ...this };
      }
    };
    mockNotificationFindByIdAndUpdate.mockResolvedValueOnce(updatedDoc);

    // Editing without attachments (manual content mode where attachments was removed)
    const res = await request(app)
      .put(`/api/notifications/${validId}`)
      .send({
        recipient: { email: 'test@example.com' },
        content: {
          subject: 'Updated Subject',
          message: 'Updated Message',
          attachments: [], // Cleared attachments
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify attachments key is completely removed in updated content
    const callArgs = mockNotificationFindByIdAndUpdate.mock.calls[0][1];
    expect(callArgs.$set.content).toEqual({
      subject: 'Updated Subject',
      message: 'Updated Message'
    });
    expect(callArgs.$set.content.attachments).toBeUndefined();
  });
});
