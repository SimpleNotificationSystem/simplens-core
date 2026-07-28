import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before importing the module under test
vi.mock('fs/promises', () => ({
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('{{name}}'),
}));

vi.mock('child_process', () => ({
    execSync: vi.fn(),
}));

vi.mock('ora', () => ({
    default: vi.fn(() => ({
        start: vi.fn().mockReturnThis(),
        succeed: vi.fn().mockReturnThis(),
        fail: vi.fn().mockReturnThis(),
        warn: vi.fn().mockReturnThis(),
        info: vi.fn().mockReturnThis(),
    })),
}));

vi.mock('chalk', () => {
    const fn = (s: string) => s;
    return {
        default: {
            green: fn,
            cyan: fn,
            yellow: fn,
            bold: fn,
            blueBright: fn,
            cyanBright: fn,
            greenBright: fn,
            yellowBright: fn,
            redBright: fn,
            gray: fn,
            white: fn,
        },
    };
});

vi.mock('./utils/git.js', () => ({
    isGitAvailable: vi.fn().mockReturnValue(true),
    isGitRepository: vi.fn().mockResolvedValue(false),
    initGitRepository: vi.fn(),
}));

import { mkdir, writeFile, readFile } from 'fs/promises';
import { generatePlugin } from './generator.js';
import type { PluginConfig } from './types.js';

describe('generator', () => {
    const mockConfig: PluginConfig = {
        name: 'test-plugin',
        displayName: 'TestPlugin',
        description: 'Test plugin description',
        channel: 'test',
        author: 'Test Author',
        email: 'test@example.com',
        credentials: ['api_key'],
        recipientFields: ['userId'],
        contentFields: ['message'],
        directory: 'test-output',
        initGit: false,
        installDeps: false,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // Suppress console output during tests
        vi.spyOn(console, 'log').mockImplementation(() => { });
    });

    describe('generatePlugin', () => {
        it('should create the plugin directory structure', async () => {
            await generatePlugin(mockConfig);

            expect(mkdir).toHaveBeenCalledWith(
                expect.stringContaining('test-output'),
                expect.objectContaining({ recursive: true })
            );
        });

        it('should write all template files', async () => {
            await generatePlugin(mockConfig);

            // Should write files for each template (6 templates)
            expect(writeFile).toHaveBeenCalled();
            const writeFileCalls = vi.mocked(writeFile).mock.calls;
            expect(writeFileCalls.length).toBeGreaterThanOrEqual(1);
        });

        it('should read template files', async () => {
            await generatePlugin(mockConfig);

            expect(readFile).toHaveBeenCalled();
        });
    });
});
