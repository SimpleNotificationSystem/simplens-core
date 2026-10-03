/**
 * Unit tests for plugin-fs.ts
 * Tests package name and version validation and spawnSync command execution
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSpawnSync = vi.fn();
vi.mock('child_process', () => ({
  spawnSync: (...args: unknown[]) => mockSpawnSync(...args),
  readFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

describe('Plugin FS Package Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawnSync.mockReturnValue({
      status: 0,
      stderr: Buffer.from(''),
      stdout: Buffer.from(''),
    });
  });

  describe('installNpmPackage', () => {
    it('should reject package names with shell injection characters', async () => {
      const { installNpmPackage } = await import('@src/plugins/loader/plugin-fs.js');

      expect(() => installNpmPackage('express; rm -rf /')).toThrow(/invalid npm package name/i);
      expect(() => installNpmPackage('express && calc')).toThrow(/invalid npm package name/i);
      expect(() => installNpmPackage('express | whoami')).toThrow(/invalid npm package name/i);
      expect(() => installNpmPackage('`calc`')).toThrow(/invalid npm package name/i);
      expect(() => installNpmPackage('$(whoami)')).toThrow(/invalid npm package name/i);
      expect(() => installNpmPackage('foo/bar/baz')).toThrow(/invalid npm package name/i);
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });

    it('should reject version strings with shell injection characters', async () => {
      const { installNpmPackage } = await import('@src/plugins/loader/plugin-fs.js');

      expect(() => installNpmPackage('lodash', '1.0.0; calc')).toThrow(/invalid npm package version/i);
      expect(() => installNpmPackage('lodash', '^1.0.0 & whoami')).toThrow(/invalid npm package version/i);
      expect(() => installNpmPackage('lodash', '$(cat /etc/passwd)')).toThrow(/invalid npm package version/i);
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });

    it('should invoke spawnSync with argument array for valid packages', async () => {
      const { installNpmPackage } = await import('@src/plugins/loader/plugin-fs.js');

      installNpmPackage('lodash', '4.17.21');

      expect(mockSpawnSync).toHaveBeenCalledTimes(1);
      const [cmd, args] = mockSpawnSync.mock.calls[0];
      expect(cmd).toMatch(/npm(\.cmd)?$/);
      expect(args).toEqual(['install', 'lodash@4.17.21']);
    });

    it('should invoke spawnSync with argument array for valid scoped packages', async () => {
      const { installNpmPackage } = await import('@src/plugins/loader/plugin-fs.js');

      installNpmPackage('@simplens/provider-smtp', '^1.2.0');

      expect(mockSpawnSync).toHaveBeenCalledTimes(1);
      const [cmd, args] = mockSpawnSync.mock.calls[0];
      expect(cmd).toMatch(/npm(\.cmd)?$/);
      expect(args).toEqual(['install', '@simplens/provider-smtp@^1.2.0']);
    });
  });

  describe('uninstallNpmPackage', () => {
    it('should reject package names with shell injection characters', async () => {
      const { uninstallNpmPackage } = await import('@src/plugins/loader/plugin-fs.js');

      expect(() => uninstallNpmPackage('lodash; rm -rf /')).toThrow(/invalid npm package name/i);
      expect(() => uninstallNpmPackage('foo & calc')).toThrow(/invalid npm package name/i);
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });

    it('should invoke spawnSync with argument array for valid package', async () => {
      const { uninstallNpmPackage } = await import('@src/plugins/loader/plugin-fs.js');

      uninstallNpmPackage('@simplens/provider-smtp');

      expect(mockSpawnSync).toHaveBeenCalledTimes(1);
      const [cmd, args] = mockSpawnSync.mock.calls[0];
      expect(cmd).toMatch(/npm(\.cmd)?$/);
      expect(args).toEqual(['uninstall', '@simplens/provider-smtp']);
    });
  });
});
