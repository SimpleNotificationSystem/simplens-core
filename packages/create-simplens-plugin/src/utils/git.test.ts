import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { access } from 'fs/promises';
import { isGitAvailable, initGitRepository, isGitRepository } from './git.js';

// Mock child_process
vi.mock('child_process', () => ({
    execSync: vi.fn(),
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
    access: vi.fn(),
    constants: { F_OK: 0 },
}));

describe('git utilities', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('isGitAvailable', () => {
        it('should return true when git is available', () => {
            vi.mocked(execSync).mockReturnValue(Buffer.from('git version 2.40.0'));
            expect(isGitAvailable()).toBe(true);
            expect(execSync).toHaveBeenCalledWith('git --version', { stdio: 'ignore' });
        });

        it('should return false when git is not available', () => {
            vi.mocked(execSync).mockImplementation(() => {
                throw new Error('Command not found');
            });
            expect(isGitAvailable()).toBe(false);
        });
    });

    describe('initGitRepository', () => {
        it('should run git init in the specified directory', () => {
            initGitRepository('/path/to/dir');
            expect(execSync).toHaveBeenCalledWith('git init', {
                cwd: '/path/to/dir',
                stdio: 'ignore',
            });
        });
    });

    describe('isGitRepository', () => {
        it('should return true when .git folder exists', async () => {
            vi.mocked(access).mockResolvedValue(undefined);
            const result = await isGitRepository('/path/to/repo');
            expect(result).toBe(true);
        });

        it('should return false when .git folder does not exist', async () => {
            vi.mocked(access).mockRejectedValue(new Error('ENOENT'));
            const result = await isGitRepository('/path/to/dir');
            expect(result).toBe(false);
        });
    });
});
