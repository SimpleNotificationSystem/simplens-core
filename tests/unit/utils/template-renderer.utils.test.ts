import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/workers/utils/logger.js', () => ({
  apiLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  },
}));

import {
  MAX_TEMPLATE_RENDER_DEPTH,
  containsPlaceholderToken,
  extractExplicitTemplateVariableNames,
  findUnresolvedTemplateVariables,
  maskTemplatePlaceholders,
  normalizeTemplateContentVariables,
  normalizeTemplateVariablesInString,
  renderNotificationContent,
  renderTemplateVariables,
  replaceTemplateVariablesInString,
  templatePropertyPathKey,
} from '../../../src/utils/template-renderer.utils.js';

describe('replaceTemplateVariablesInString - syntax support', () => {
  const variables = { name: 'Ada' };

  it.each([
    ['{{name}}', 'canonical braces'],
    ['{{ name }}', 'braces with whitespace'],
    ['{name}', 'single braces'],
    ['$name', 'bare dollar'],
    ['${name}', 'dollar braces'],
    ['${{name}}', 'dollar double braces'],
    ['${{ name }}', 'dollar double braces with whitespace'],
  ])('renders %s (%s)', (template) => {
    expect(replaceTemplateVariablesInString(template, variables)).toBe('Ada');
  });

  it('renders every token in a longer string', () => {
    expect(
      replaceTemplateVariablesInString('Hi {{name}}, {name}, ${name}, $name!', variables),
    ).toBe('Hi Ada, Ada, Ada, Ada!');
  });

  it('supports dots and hyphens inside braced identifiers', () => {
    expect(
      replaceTemplateVariablesInString('{{user.name}}/{{user-name}}', {
        'user.name': 'Ada',
        'user-name': 'Lovelace',
      }),
    ).toBe('Ada/Lovelace');
  });

  it('leaves currency, CSS and JSON literals untouched', () => {
    const input = 'Cost $100 (was $5.50, $0). body { color: red; } {"k":"v"}';
    expect(replaceTemplateVariablesInString(input, variables)).toBe(input);
  });

  it('returns the input when variables are missing', () => {
    expect(replaceTemplateVariablesInString('{{name}}', {})).toBe('{{name}}');
  });

  it('leaves unresolved tokens verbatim', () => {
    expect(replaceTemplateVariablesInString('Hi {{missing}}', variables)).toBe(
      'Hi {{missing}}',
    );
  });
});

describe('replaceTemplateVariablesInString - value semantics', () => {
  it('inserts values containing dollar patterns literally', () => {
    expect(
      replaceTemplateVariablesInString('{{price}} {{price}} {{price}} {{price}}', {
        price: '$& $1 $$ $100',
      }),
    ).toBe('$& $1 $$ $100 $& $1 $$ $100 $& $1 $$ $100 $& $1 $$ $100');
  });

  it('never rescans substituted values (single pass)', () => {
    expect(
      replaceTemplateVariablesInString('{{a}}', { a: '{{b}}', b: 'secret' }),
    ).toBe('{{b}}');
  });

  it('coerces numbers, booleans and objects', () => {
    const variables = { count: 42, enabled: true, payload: { a: 1 } };
    expect(replaceTemplateVariablesInString('{{count}}', variables)).toBe('42');
    expect(replaceTemplateVariablesInString('{{enabled}}', variables)).toBe('true');
    expect(replaceTemplateVariablesInString('{{payload}}', variables)).toBe('{"a":1}');
  });

  it('renders null as an empty string', () => {
    expect(replaceTemplateVariablesInString('[{{value}}]', { value: null })).toBe('[]');
  });
});

describe('renderTemplateVariables - tree walk', () => {
  it('renders nested objects and arrays', () => {
    const content = {
      subject: 'Hi {{name}}',
      body: { lines: ['{{greeting}}', 'Bye {{name}}'] },
    };
    expect(
      renderTemplateVariables(content, { name: 'Ada', greeting: 'Hello' }),
    ).toEqual({
      subject: 'Hi Ada',
      body: { lines: ['Hello', 'Bye Ada'] },
    });
  });

  it('reuses unchanged subtrees (copy-on-change)', () => {
    const unchanged = { text: 'no tokens here' };
    const content = { unchanged, changed: { text: '{{name}}' } };
    const rendered = renderTemplateVariables(content, { name: 'Ada' });

    expect(rendered).not.toBe(content);
    expect(rendered.unchanged).toBe(unchanged);
    expect(rendered.changed).not.toBe(content.changed);
    expect(rendered.changed.text).toBe('Ada');
  });

  it('returns the original object when nothing changes', () => {
    const content = { message: 'plain text' };
    expect(renderTemplateVariables(content, { name: 'Ada' })).toBe(content);
  });

  it('preserves non-plain objects by identity', () => {
    const buffer = Buffer.from('binary');
    const date = new Date('2024-01-01T00:00:00.000Z');
    const regex = /abc/g;
    const map = new Map<string, string>([['a', '{{name}}']]);
    const set = new Set<string>(['{{name}}']);

    const rendered = renderTemplateVariables(
      { buffer, date, regex, map, set },
      { name: 'Ada' },
    );

    expect(rendered.buffer).toBe(buffer);
    expect(rendered.date).toBe(date);
    expect(rendered.regex).toBe(regex);
    expect(rendered.map).toBe(map);
    expect(rendered.set).toBe(set);
  });

  it('resolves dotted names from flat keys first', () => {
    expect(
      renderTemplateVariables('{{user.name}}', { 'user.name': 'Flat' }),
    ).toBe('Flat');
  });

  it('resolves dotted names through nested objects', () => {
    expect(
      renderTemplateVariables('{{user.name}}', { user: { name: 'Nested' } }),
    ).toBe('Nested');
  });

  it('never resolves prototype members', () => {
    expect(
      renderTemplateVariables('{{constructor}} {{__proto__.x}} {{toString}}', {}),
    ).toBe('{{constructor}} {{__proto__.x}} {{toString}}');
  });

  it('stops at the maximum depth without throwing', () => {
    const root: Record<string, unknown> = {};
    let cursor = root;
    for (let i = 0; i < 20; i += 1) {
      const child: Record<string, unknown> = {};
      cursor[`level${i}`] = child;
      cursor = child;
    }
    cursor.deep = '{{name}}';

    const rendered = renderTemplateVariables(root, { name: 'Ada' });
    expect(JSON.stringify(rendered)).toContain('{{name}}');
    expect(MAX_TEMPLATE_RENDER_DEPTH).toBe(15);
  });

  it('scales roughly linearly with input size', () => {
    const build = (count: number) =>
      Array.from({ length: count }, (_, index) => `Hello {{name}} #${index}`);

    const small = build(2000);
    const large = build(20000);

    // Warm up both code paths.
    renderTemplateVariables(small, { name: 'Ada' });
    renderTemplateVariables(large, { name: 'Ada' });

    const smallStart = process.hrtime.bigint();
    renderTemplateVariables(small, { name: 'Ada' });
    const smallDuration = Number(process.hrtime.bigint() - smallStart);

    const largeStart = process.hrtime.bigint();
    renderTemplateVariables(large, { name: 'Ada' });
    const largeDuration = Number(process.hrtime.bigint() - largeStart);

    expect(largeDuration).toBeLessThan(smallDuration * 40 + 50_000_000);
  });
});

describe('renderNotificationContent', () => {
  it('renders content and leaves other payload fields alone', () => {
    const notification = {
      notification_id: 'n1',
      recipient: { email: '{{email}}' },
      content: { subject: 'Hi {{name}}' },
      variables: { name: 'Ada', email: 'a@example.com' },
    };

    const rendered = renderNotificationContent(notification);

    expect(rendered.content).toEqual({ subject: 'Hi Ada' });
    expect(rendered.recipient).toBe(notification.recipient);
    expect(rendered.variables).toBe(notification.variables);
  });

  it('accepts explicit variables', () => {
    expect(
      renderNotificationContent({ content: '{{name}}' }, { name: 'Ada' }).content,
    ).toBe('Ada');
  });

  it('returns the notification unchanged without variables', () => {
    const notification = { content: '{{name}}' };
    expect(renderNotificationContent(notification)).toBe(notification);
  });
});

describe('placeholder detection', () => {
  it('extracts only explicit double-brace names, deduped and ordered', () => {
    const content = {
      a: '{{one}} {{two}} {{one}}',
      b: ['{{two}}', '${three}', '{four}', '$five'],
    };
    expect(extractExplicitTemplateVariableNames(content)).toEqual(['one', 'two']);
    expect(containsPlaceholderToken(content)).toBe(true);
    expect(findUnresolvedTemplateVariables(content, { one: 'x' })).toEqual(['two']);
    expect(findUnresolvedTemplateVariables(content, { one: 'x', two: 'y' })).toEqual([]);
  });

  it('reports every explicit name when variables are absent', () => {
    expect(findUnresolvedTemplateVariables('{{one}} {{two}}')).toEqual(['one', 'two']);
  });

  it('ignores literal text', () => {
    expect(containsPlaceholderToken('Cost $100, { color: red }')).toBe(false);
  });

  it('masks placeholder leaves and records their paths', () => {
    const maskedPaths = new Set<string>();
    const masked = maskTemplatePlaceholders(
      { email: '{{email}}', nested: { html: '<b>{{body}}</b>' }, plain: 'ok' },
      maskedPaths,
    ) as Record<string, unknown>;

    expect(masked.email).toBe('__SIMPLENS_PLACEHOLDER__');
    expect((masked.nested as Record<string, unknown>).html).toBe(
      '__SIMPLENS_PLACEHOLDER__',
    );
    expect(masked.plain).toBe('ok');
    expect(maskedPaths.has(templatePropertyPathKey(['email']))).toBe(true);
    expect(maskedPaths.has(templatePropertyPathKey(['nested', 'html']))).toBe(true);
  });
});

describe('template normalisation', () => {
  it.each([
    ['$name', '{{name}}'],
    ['${name}', '{{name}}'],
    ['{name}', '{{name}}'],
    ['${{name}}', '{{name}}'],
    ['{{name}}', '{{name}}'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalizeTemplateVariablesInString(input)).toBe(expected);
  });

  it('keeps dots and hyphens', () => {
    expect(normalizeTemplateVariablesInString('{user.name} ${user-name}')).toBe(
      '{{user.name}} {{user-name}}',
    );
  });

  it('does not touch currency, CSS declarations or JSON', () => {
    const input = 'Cost $100 / $5.50 / { color: red } / {"k":"v"}';
    expect(normalizeTemplateVariablesInString(input)).toBe(input);
  });

  it('normalises nested content', () => {
    expect(
      normalizeTemplateContentVariables({ a: ['$x', { b: '${y}' }] }),
    ).toEqual({ a: ['{{x}}', { b: '{{y}}' }] });
  });
});
