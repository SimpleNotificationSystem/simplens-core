import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
    buildBashControlScript,
    buildPowerShellControlScript,
    generateControlScript,
} from '../scripts.js';

describe('control script generation', () => {
    describe('buildBashControlScript', () => {
        it('includes docker compose and docker-compose fallback detection', () => {
            const script = buildBashControlScript();
            expect(script).toContain('docker compose version');
            expect(script).toContain('command -v docker-compose');
            expect(script).toContain('COMPOSE_CMD="docker compose"');
            expect(script).toContain('COMPOSE_CMD="docker-compose"');
        });

        it('supports all required flags: --infra, --app, --stop, -v / --volumes', () => {
            const script = buildBashControlScript();
            expect(script).toContain('--infra)');
            expect(script).toContain('--app)');
            expect(script).toContain('--stop)');
            expect(script).toContain('-v|--volumes)');
        });

        it('handles starting both infra and app compose files by default', () => {
            const script = buildBashControlScript();
            expect(script).toContain('COMPOSE_ACTION="up -d"');
            expect(script).toContain('$COMPOSE_CMD -f docker-compose.infra.yaml $COMPOSE_ACTION');
            expect(script).toContain('$COMPOSE_CMD -f docker-compose.yaml $COMPOSE_ACTION');
        });

        it('handles stopping services with or without volumes', () => {
            const script = buildBashControlScript();
            expect(script).toContain('COMPOSE_ACTION="down"');
            expect(script).toContain('COMPOSE_ACTION="down -v"');
        });
    });

    describe('buildPowerShellControlScript', () => {
        it('includes parameters and remaining args for dash and double-dash flags', () => {
            const script = buildPowerShellControlScript();
            expect(script).toContain('[switch]$Infra');
            expect(script).toContain('[switch]$App');
            expect(script).toContain('[switch]$Stop');
            expect(script).toContain('[Alias("v")][switch]$Volumes');
            expect(script).toContain('--infra');
            expect(script).toContain('--app');
            expect(script).toContain('--stop');
            expect(script).toContain('-v');
        });

        it('includes docker compose and docker-compose fallback detection', () => {
            const script = buildPowerShellControlScript();
            expect(script).toContain('docker compose version');
            expect(script).toContain('docker-compose --version');
            expect(script).toContain('docker-compose-plugin');
            expect(script).toContain('docker-compose-standalone');
        });

        it('handles starting and stopping compose files', () => {
            const script = buildPowerShellControlScript();
            expect(script).toContain('"docker-compose.infra.yaml"');
            expect(script).toContain('"docker-compose.yaml"');
            expect(script).toContain('@("down", "-v")');
            expect(script).toContain('@("up", "-d")');
        });
    });

    describe('generateControlScript', () => {
        let tempDir: string;

        beforeEach(async () => {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onboard-test-'));
        });

        afterEach(async () => {
            await fs.rm(tempDir, { recursive: true, force: true });
        });

        it('generates simplens.ps1 for windows', async () => {
            const filename = await generateControlScript(tempDir, { os: 'windows' });
            expect(filename).toBe('simplens.ps1');

            const content = await fs.readFile(path.join(tempDir, 'simplens.ps1'), 'utf-8');
            expect(content).toContain('.SYNOPSIS');
            expect(content).toContain('SimpleNS Control Script for Windows PowerShell');
        });

        it('generates simplens.sh for linux/darwin with executable permissions', async () => {
            const filename = await generateControlScript(tempDir, { os: 'linux' });
            expect(filename).toBe('simplens.sh');

            const content = await fs.readFile(path.join(tempDir, 'simplens.sh'), 'utf-8');
            expect(content).toContain('#!/usr/bin/env bash');
            expect(content).toContain('docker compose version');

            const stats = await fs.stat(path.join(tempDir, 'simplens.sh'));
            expect(stats.isFile()).toBe(true);
        });
    });
});
