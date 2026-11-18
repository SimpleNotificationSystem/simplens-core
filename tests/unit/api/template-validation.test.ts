import { beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import z from 'zod';
import { z as zV3 } from 'zod/v3';

vi.mock('../../../src/database/models/notification.models.js', () => ({
  default: {
    insertMany: vi.fn(),
    findOne: vi.fn(),
  },
}));

vi.mock('../../../src/database/models/outbox.models.js', () => ({
  default: {
    insertMany: vi.fn(),
  },
}));

vi.mock('../../../src/database/models/notification-template.models.js', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
  },
}));

vi.mock('../../../src/database/models/api-key.models.js', () => ({
  default: {
    updateOne: vi.fn().mockReturnValue({ catch: vi.fn() }),
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

const providerContentSchema = z.object({
  subject: z.string().min(1),
  message: z.string().min(1),
  reply_to: z.string().email().optional(),
  html: z
    .string()
    .refine((value) => /<[a-z][\s\S]*>/i.test(value), 'html must contain a tag')
    .optional(),
  count: z.number().optional(),
});

const testProvider = {
  manifest: { name: 'test-provider', channel: 'email', displayName: 'Test' },
  getContentSchema: () => providerContentSchema,
  getFileAttachmentConfig: () => ({ enabled: true }),
};

vi.mock('../../../src/plugins/index.js', () => ({
  PluginRegistry: {
    get: vi.fn(() => testProvider),
    getDefaultProvider: vi.fn(() => testProvider),
    getDefaultProviderId: vi.fn(() => 'test-provider'),
    getRegistered: vi.fn(() => undefined),
    has: vi.fn(() => true),
    hasChannel: vi.fn(() => true),
  },
}));

describe('validateContentSchema with template variables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates a transient render and does not mutate the stored content', async () => {
    const { validateContentSchema } = await import(
      '../../../src/api/utils/utils.js'
    );

    const content = {
      subject: 'Hello {{name}}',
      message: 'Body',
      reply_to: '{{reply_to}}',
    };

    expect(() =>
      validateContentSchema('email', content, undefined, {
        name: 'Ada',
        reply_to: 'ada@example.com',
      }),
    ).not.toThrow();

    // Raw content is untouched for persistence.
    expect(content.reply_to).toBe('{{reply_to}}');
    expect(content.subject).toBe('Hello {{name}}');
  });

  it('rejects a rendered value that fails the provider schema', async () => {
    const { validateContentSchema, InvalidContentSchemaError } = await import(
      '../../../src/api/utils/utils.js'
    );

    expect(() =>
      validateContentSchema(
        'email',
        {
          subject: 'Hi {{name}}',
          message: 'Body',
          reply_to: '{{reply_to}}',
        },
        undefined,
        { name: 'Ada', reply_to: 'not-an-email' },
      ),
    ).toThrow(InvalidContentSchemaError);
  });

  it('throws MissingTemplateVariablesError listing unresolved explicit names', async () => {
    const { validateContentSchema, MissingTemplateVariablesError } = await import(
      '../../../src/api/utils/utils.js'
    );

    expect(() =>
      validateContentSchema(
        'email',
        {
          subject: 'Hi {{name}} {{unknown}}',
          message: 'Body',
        },
        undefined,
        { name: 'Ada' },
      ),
    ).toThrow(MissingTemplateVariablesError);

    try {
      validateContentSchema(
        'email',
        { subject: 'Hi {{name}} {{unknown}}', message: 'Body' },
        undefined,
        { name: 'Ada' },
      );
    } catch (error) {
      expect((error as InstanceType<typeof MissingTemplateVariablesError>).missingVariables).toEqual([
        'unknown',
      ]);
    }
  });

  it('also fails on an explicitly supplied empty variables object', async () => {
    const { validateContentSchema, MissingTemplateVariablesError } = await import(
      '../../../src/api/utils/utils.js'
    );

    expect(() =>
      validateContentSchema(
        'email',
        { subject: 'Hi {{name}}', message: 'Body' },
        undefined,
        {},
      ),
    ).toThrow(MissingTemplateVariablesError);
  });

  it('does not enforce missing variables when variables are omitted', async () => {
    const { validateContentSchema, MissingTemplateVariablesError } = await import(
      '../../../src/api/utils/utils.js'
    );

    let thrown: unknown;
    try {
      validateContentSchema('email', {
        subject: 'Hi {{name}}',
        message: 'Body',
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).not.toBeInstanceOf(MissingTemplateVariablesError);
  });
});

describe('validateTemplateContent (structure-only semantics)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts placeholders in strict fields', async () => {
    const { validateTemplateContent } = await import(
      '../../../src/api/utils/utils.js'
    );

    const result = validateTemplateContent(
      {
        subject: 'Order {{order_id}}',
        message: 'Thanks {{name}}',
        reply_to: '{{reply_to}}',
        html: '{{html_body}}',
      },
      providerContentSchema,
    );

    expect(result.success).toBe(true);
  });

  it('accepts a template that only fails a value-level refine', async () => {
    const { validateTemplateContent } = await import(
      '../../../src/api/utils/utils.js'
    );

    const result = validateTemplateContent(
      { subject: 'Hello', message: 'Body', html: '{{html_body}}' },
      providerContentSchema,
    );

    expect(result.success).toBe(true);
  });

  it('still rejects missing required fields', async () => {
    const { validateTemplateContent } = await import(
      '../../../src/api/utils/utils.js'
    );

    const result = validateTemplateContent({ message: 'Body' }, providerContentSchema);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain(
        'subject',
      );
    }
  });

  it('still rejects value violations in fields without placeholders', async () => {
    const { validateTemplateContent } = await import(
      '../../../src/api/utils/utils.js'
    );

    const result = validateTemplateContent(
      { subject: 'Hello', message: 'Body', html: 'plain text' },
      providerContentSchema,
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain(
        'html',
      );
    }
  });

  it('does not ignore type errors on placeholder values', async () => {
    const { validateTemplateContent } = await import(
      '../../../src/api/utils/utils.js'
    );

    const result = validateTemplateContent(
      { subject: 'Hello', message: 'Body', count: '{{count}}' },
      providerContentSchema,
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain(
        'count',
      );
    }
  });
});

describe('notification ingestion with template variables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates the rendered content but stores the raw template', async () => {
    const { convert_notification_request_to_notification_schema } = await import(
      '../../../src/api/utils/utils.js'
    );
    const { randomUUID } = await import('crypto');

    const notifications = await convert_notification_request_to_notification_schema({
      request_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
      client_id: randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
      channel: ['email'],
      recipient: { email: 'ada@example.com' },
      content: {
        email: {
          subject: 'Hi ${name}',
          message: 'Body',
          reply_to: '{{reply_to}}',
        },
      },
      variables: { name: 'Ada', reply_to: 'ada@example.com' },
      webhook_url: 'https://example.com/callback',
    });

    expect(notifications).toHaveLength(1);
    // Legacy `${name}` remains untouched and is rendered at dispatch time.
    expect(notifications[0].content).toEqual({
      subject: 'Hi ${name}',
      message: 'Body',
      reply_to: '{{reply_to}}',
    });
    expect(notifications[0].variables).toEqual({
      name: 'Ada',
      reply_to: 'ada@example.com',
    });
  });
});

describe('validateTemplateContent - common string validators (Zod 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const valueCases: Array<{
    name: string;
    schema: z.ZodType;
    content: Record<string, unknown>;
  }> = [
    {
      name: 'email (z.email())',
      schema: z.object({ email: z.email() }),
      content: { email: '{{email}}' },
    },
    {
      name: 'email (z.string().email())',
      schema: z.object({ email: z.string().email() }),
      content: { email: '{{email}}' },
    },
    {
      name: 'url (z.url())',
      schema: z.object({ website: z.url() }),
      content: { website: '{{website}}' },
    },
    {
      name: 'url (z.string().url())',
      schema: z.object({ website: z.string().url() }),
      content: { website: '{{website}}' },
    },
    {
      name: 'uuid',
      schema: z.object({ id: z.uuid() }),
      content: { id: '{{id}}' },
    },
    {
      name: 'ISO datetime',
      schema: z.object({ at: z.iso.datetime() }),
      content: { at: '{{at}}' },
    },
    {
      name: 'phone via regex',
      schema: z.object({ phone: z.string().regex(/^\+?[1-9]\d{1,14}$/) }),
      content: { phone: '{{phone}}' },
    },
    {
      name: 'phone via refine',
      schema: z.object({
        phone: z
          .string()
          .refine((value) => /^\+?\d{7,15}$/.test(value), 'Invalid phone'),
      }),
      content: { phone: '{{phone}}' },
    },
    {
      name: 'ipv4 address',
      schema: z.object({ ip: z.ipv4() }),
      content: { ip: '{{ip}}' },
    },
    {
      name: 'ipv6 address',
      schema: z.object({ ip: z.ipv6() }),
      content: { ip: '{{ip}}' },
    },
    {
      name: 'base64 payload',
      schema: z.object({ blob: z.base64() }),
      content: { blob: '{{blob}}' },
    },
    {
      name: 'startsWith prefix',
      schema: z.object({ order_id: z.string().startsWith('ORD-') }),
      content: { order_id: '{{order_id}}' },
    },
    {
      name: 'includes substring',
      schema: z.object({ handle: z.string().includes('@') }),
      content: { handle: '{{handle}}' },
    },
    {
      name: 'cuid',
      schema: z.object({ id: z.cuid() }),
      content: { id: '{{id}}' },
    },
    {
      name: 'nanoid',
      schema: z.object({ id: z.nanoid() }),
      content: { id: '{{id}}' },
    },
    {
      name: 'min length',
      schema: z.object({ code: z.string().min(10) }),
      content: { code: '{{code}}' },
    },
    {
      name: 'max length',
      schema: z.object({ code: z.string().max(3) }),
      content: { code: '{{code}}' },
    },
    {
      name: 'enum',
      schema: z.object({ priority: z.enum(['low', 'high']) }),
      content: { priority: '{{priority}}' },
    },
    {
      name: 'literal',
      schema: z.object({ kind: z.literal('fixed') }),
      content: { kind: '{{kind}}' },
    },
    {
      name: 'union of formats',
      schema: z.object({ contact: z.union([z.email(), z.url()]) }),
      content: { contact: '{{contact}}' },
    },
    {
      name: 'nested sender.reply_to',
      schema: z.object({
        sender: z.object({ reply_to: z.email().optional() }).optional(),
      }),
      content: { sender: { reply_to: '{{reply_to}}' } },
    },
    {
      name: 'url array element',
      schema: z.object({ attachments: z.array(z.url()) }),
      content: { attachments: ['{{attachment_url}}'] },
    },
  ];

  it.each(valueCases)('accepts a placeholder for $name', async ({ schema, content }) => {
    // The raw placeholder must fail on its own, otherwise the case proves nothing.
    expect(schema.safeParse(content).success).toBe(false);

    const { validateTemplateContent } = await import(
      '../../../src/api/utils/utils.js'
    );
    expect(validateTemplateContent(content, schema).success).toBe(true);
  });

  const structuralCases: Array<{
    name: string;
    schema: z.ZodType;
    content: Record<string, unknown>;
  }> = [
    {
      name: 'number',
      schema: z.object({ count: z.number() }),
      content: { count: '{{count}}' },
    },
    {
      name: 'boolean',
      schema: z.object({ flag: z.boolean() }),
      content: { flag: '{{flag}}' },
    },
    {
      name: 'array',
      schema: z.object({ tags: z.array(z.string()) }),
      content: { tags: '{{tags}}' },
    },
    {
      name: 'date',
      schema: z.object({ at: z.date() }),
      content: { at: '{{at}}' },
    },
    {
      name: 'record',
      schema: z.object({ meta: z.record(z.string(), z.string()) }),
      content: { meta: '{{meta}}' },
    },
  ];

  it.each(structuralCases)(
    'still rejects a placeholder for non-string field $name',
    async ({ schema, content }) => {
      const { validateTemplateContent } = await import(
        '../../../src/api/utils/utils.js'
      );
      expect(validateTemplateContent(content, schema).success).toBe(false);
    },
  );

  it('still rejects a genuinely invalid field next to a masked one', async () => {
    const { validateTemplateContent } = await import(
      '../../../src/api/utils/utils.js'
    );

    const result = validateTemplateContent(
      { email: '{{email}}', website: 'not a url' },
      z.object({ email: z.email(), website: z.url() }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual([
        'website',
      ]);
    }
  });
});

describe('validateTemplateContent - common string validators (Zod 3, plugin-bundled)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const valueCases: Array<{
    name: string;
    schema: zV3.ZodTypeAny;
    content: Record<string, unknown>;
  }> = [
    {
      name: 'email',
      schema: zV3.object({ email: zV3.string().email() }),
      content: { email: '{{email}}' },
    },
    {
      name: 'url',
      schema: zV3.object({ website: zV3.string().url() }),
      content: { website: '{{website}}' },
    },
    {
      name: 'uuid',
      schema: zV3.object({ id: zV3.string().uuid() }),
      content: { id: '{{id}}' },
    },
    {
      name: 'datetime',
      schema: zV3.object({ at: zV3.string().datetime() }),
      content: { at: '{{at}}' },
    },
    {
      name: 'phone via regex',
      schema: zV3.object({
        phone: zV3.string().regex(/^\+?[1-9]\d{1,14}$/),
      }),
      content: { phone: '{{phone}}' },
    },
    {
      name: 'phone via refine',
      schema: zV3.object({
        phone: zV3
          .string()
          .refine((value) => /^\+?\d{7,15}$/.test(value), 'Invalid phone'),
      }),
      content: { phone: '{{phone}}' },
    },
    {
      name: 'ip address',
      schema: zV3.object({ ip: zV3.string().ip() }),
      content: { ip: '{{ip}}' },
    },
    {
      name: 'base64 payload',
      schema: zV3.object({ blob: zV3.string().base64() }),
      content: { blob: '{{blob}}' },
    },
    {
      name: 'startsWith prefix',
      schema: zV3.object({ order_id: zV3.string().startsWith('ORD-') }),
      content: { order_id: '{{order_id}}' },
    },
    {
      name: 'includes substring',
      schema: zV3.object({ handle: zV3.string().includes('@') }),
      content: { handle: '{{handle}}' },
    },
    {
      name: 'cuid',
      schema: zV3.object({ id: zV3.string().cuid() }),
      content: { id: '{{id}}' },
    },
    {
      name: 'nanoid',
      schema: zV3.object({ id: zV3.string().nanoid() }),
      content: { id: '{{id}}' },
    },
    {
      name: 'min length',
      schema: zV3.object({ code: zV3.string().min(10) }),
      content: { code: '{{code}}' },
    },
    {
      name: 'max length',
      schema: zV3.object({ code: zV3.string().max(3) }),
      content: { code: '{{code}}' },
    },
    {
      name: 'enum',
      schema: zV3.object({ priority: zV3.enum(['low', 'high']) }),
      content: { priority: '{{priority}}' },
    },
    {
      name: 'union of formats',
      schema: zV3.object({
        contact: zV3.union([zV3.string().email(), zV3.string().url()]),
      }),
      content: { contact: '{{contact}}' },
    },
    {
      name: 'nested sender.reply_to',
      schema: zV3.object({
        sender: zV3
          .object({ reply_to: zV3.string().email().optional() })
          .optional(),
      }),
      content: { sender: { reply_to: '{{reply_to}}' } },
    },
    {
      name: 'url array element',
      schema: zV3.object({ attachments: zV3.array(zV3.string().url()) }),
      content: { attachments: ['{{attachment_url}}'] },
    },
  ];

  it.each(valueCases)(
    'accepts a placeholder for $name (plugin Zod 3 codes)',
    async ({ schema, content }) => {
      expect(schema.safeParse(content).success).toBe(false);

      const { validateTemplateContent } = await import(
        '../../../src/api/utils/utils.js'
      );
      expect(validateTemplateContent(content, schema as never).success).toBe(true);
    },
  );

  it.each([
    { name: 'number', schema: zV3.object({ count: zV3.number() }), content: { count: '{{count}}' } },
    { name: 'boolean', schema: zV3.object({ flag: zV3.boolean() }), content: { flag: '{{flag}}' } },
    { name: 'array', schema: zV3.object({ tags: zV3.array(zV3.string()) }), content: { tags: '{{tags}}' } },
    { name: 'date', schema: zV3.object({ at: zV3.date() }), content: { at: '{{at}}' } },
  ])(
    'still rejects a placeholder for non-string field $name',
    async ({ schema, content }) => {
      const { validateTemplateContent } = await import(
        '../../../src/api/utils/utils.js'
      );
      expect(validateTemplateContent(content, schema as never).success).toBe(false);
    },
  );
});

describe('validateTemplateContent with plugin-bundled Zod 3 issue codes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createV3StyleSchema = (code: string) => ({
    safeParse: (value: unknown) => {
      const replyTo = (value as { sender?: { reply_to?: string } }).sender
        ?.reply_to;
      const valid =
        typeof replyTo === 'string' &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo);

      if (valid) {
        return { success: true as const, data: value };
      }

      return {
        success: false as const,
        error: {
          issues: [{ code, path: ['sender', 'reply_to'], message: 'Invalid email' }],
        },
      };
    },
  });

  it('accepts a placeholder reported as invalid_string (Zod 3 .email())', async () => {
    const { validateTemplateContent } = await import(
      '../../../src/api/utils/utils.js'
    );

    const result = validateTemplateContent(
      { sender: { reply_to: '{{reply_to}}' } },
      createV3StyleSchema('invalid_string') as never,
    );

    expect(result.success).toBe(true);
  });

  it('still rejects a structural invalid_type at the same path', async () => {
    const { validateTemplateContent } = await import(
      '../../../src/api/utils/utils.js'
    );

    const result = validateTemplateContent(
      { sender: { reply_to: '{{reply_to}}' } },
      createV3StyleSchema('invalid_type') as never,
    );

    expect(result.success).toBe(false);
  });
});

describe('toVariablesRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes through plain records and Map instances', async () => {
    const { toVariablesRecord } = await import('../../../src/api/utils/utils.js');

    expect(toVariablesRecord({ name: 'Ada' })).toEqual({ name: 'Ada' });
    expect(toVariablesRecord(new Map([['name', 'Ada']]))).toEqual({ name: 'Ada' });
  });

  it('returns undefined for empty or invalid input', async () => {
    const { toVariablesRecord } = await import('../../../src/api/utils/utils.js');

    expect(toVariablesRecord(undefined)).toBeUndefined();
    expect(toVariablesRecord(null)).toBeUndefined();
    expect(toVariablesRecord({})).toBeUndefined();
    expect(toVariablesRecord('nope')).toBeUndefined();
  });

  it('converts a Mongoose Map from a loaded notification document', async () => {
    const { toVariablesRecord } = await import('../../../src/api/utils/utils.js');

    // Retry and alert-resolve read the notification from MongoDB, where
    // `variables` is a MongooseMap. JSON.stringify would turn it into `{}`.
    const schema = new mongoose.Schema({
      variables: { type: Map, of: String },
    });
    const variables = schema.path('variables').cast({
      reply_to: 'ada@example.com',
      order_id: 42,
    });

    expect(variables).toBeInstanceOf(Map);
    expect(toVariablesRecord(variables)).toEqual({
      reply_to: 'ada@example.com',
      order_id: '42',
    });
  });

  it('coerces non-string values and drops null or undefined entries', async () => {
    const { toVariablesRecord } = await import('../../../src/api/utils/utils.js');

    expect(
      toVariablesRecord({
        count: 3,
        flag: false,
        skipped: null,
        missing: undefined,
      }),
    ).toEqual({ count: '3', flag: 'false' });
  });

  it('returns undefined when every entry is null or undefined', async () => {
    const { toVariablesRecord } = await import('../../../src/api/utils/utils.js');

    expect(toVariablesRecord({ a: null, b: undefined })).toBeUndefined();
  });

  it('keeps empty strings as explicit values', async () => {
    const { toVariablesRecord } = await import('../../../src/api/utils/utils.js');

    // An empty string is a supplied value (so it counts as resolved), unlike
    // null which is dropped and reported as a missing variable.
    expect(toVariablesRecord({ reply_to: '' })).toEqual({ reply_to: '' });
  });
});
