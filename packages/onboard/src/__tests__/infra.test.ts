import { describe, expect, it } from 'vitest';
import { buildAppComposeContent } from '../infra.js';

describe('infra app compose generation', () => {
    it('does not include nginx when disabled', () => {
        const compose = buildAppComposeContent(false);
        expect(compose).not.toContain('  nginx:');
    });

    it('includes nginx service when enabled', () => {
        const compose = buildAppComposeContent(true);
        expect(compose).toContain('  nginx:');
        expect(compose).toContain('./nginx.conf:/etc/nginx/conf.d/default.conf:ro');
    });
});
