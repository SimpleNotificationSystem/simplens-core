import { describe, expect, it } from 'vitest';
import { buildAppComposeContent, generateNginxConfig } from '../infra.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

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

    it('generates legacy compose with shared plugin-data volume and static config mount when isLegacy is true', () => {
        const compose = buildAppComposeContent(false, { isLegacy: true });
        expect(compose).toContain('plugin-data:/app/.plugins');
        expect(compose).toContain('plugin-data:');
        expect(compose).toContain('./simplens.config.yaml:/app/simplens.config.yaml:ro');
        expect(compose).toContain('SIMPLENS_CONFIG_PATH');
    });

    it('generates new compose (> 1.3.0) without plugin-data volume and without config mount when plugins skipped', () => {
        const compose = buildAppComposeContent(false, { isLegacy: false, hasPluginsConfig: false });
        expect(compose).not.toContain('plugin-data');
        expect(compose).not.toContain('simplens.config.yaml');
        expect(compose).not.toContain('SIMPLENS_CONFIG_PATH');
        expect(compose).toContain('logs-data:');
    });

    it('generates new compose (> 1.3.0) with config mount and SIMPLENS_CONFIG_PATH when plugins are configured', () => {
        const compose = buildAppComposeContent(false, { isLegacy: false, hasPluginsConfig: true });
        expect(compose).not.toContain('plugin-data');
        expect(compose).toContain('./simplens.config.yaml:/app/simplens.config.yaml:ro');
        expect(compose).toContain('SIMPLENS_CONFIG_PATH: ${SIMPLENS_CONFIG_PATH:-/app/simplens.config.yaml}');
        expect(compose).toContain('logs-data:');
    });
});

describe('generateNginxConfig', () => {
    it('generates nginx config for root basePath correctly', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onboard-test-'));
        try {
            await generateNginxConfig(tmpDir, '');
            const content = await fs.readFile(path.join(tmpDir, 'nginx.conf'), 'utf-8');
            expect(content).toContain('location ^~ /api {');
            expect(content).toContain('proxy_pass http://api:3000;');
            expect(content).toContain('location / {');
            expect(content).toContain('proxy_pass http://dashboard:3002;');
            expect(content).not.toContain('return 302');
        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });

    it('generates nginx config for legacy version (<= 1.3.0) with custom basePath correctly', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onboard-test-'));
        try {
            await generateNginxConfig(tmpDir, '/sns', { version: '1.3.0' });
            const content = await fs.readFile(path.join(tmpDir, 'nginx.conf'), 'utf-8');
            expect(content).toContain('location /api {');
            expect(content).not.toContain('location ^~ /sns/api {');
            expect(content).not.toContain('location ^~ /api {');
            expect(content).not.toContain('return 302');
        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });

    it('generates nginx config for legacy version using isLegacy flag', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onboard-test-'));
        try {
            await generateNginxConfig(tmpDir, '/sns', { isLegacy: true });
            const content = await fs.readFile(path.join(tmpDir, 'nginx.conf'), 'utf-8');
            expect(content).toContain('location /api {');
            expect(content).not.toContain('return 302');
        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });

    it('generates nginx config for version > 1.3.0 with custom basePath correctly', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onboard-test-'));
        try {
            await generateNginxConfig(tmpDir, '/sns', { version: '1.4.0' });
            const content = await fs.readFile(path.join(tmpDir, 'nginx.conf'), 'utf-8');
            expect(content).toContain('location ^~ /sns/api {');
            expect(content).toContain('return 302 /sns;');
        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });
});

