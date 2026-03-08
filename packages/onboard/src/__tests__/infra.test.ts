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

    it('does not include certbot services when ssl is disabled', () => {
        const compose = buildAppComposeContent(true, { includeSsl: false });
        expect(compose).not.toContain('  certbot:');
        expect(compose).not.toContain('  certbot-renew:');
    });

    it('includes certbot services and volumes when ssl is enabled', () => {
        const compose = buildAppComposeContent(false, { includeSsl: true });
        expect(compose).toContain('  nginx:');
        expect(compose).toContain('  certbot:');
        expect(compose).toContain('  certbot-renew:');
        expect(compose).toContain('certbot-etc:');
        expect(compose).toContain('certbot-www:');
    });
});
