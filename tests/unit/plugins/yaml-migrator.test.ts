/**
 * Unit Tests for YamlMigrator
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import { YamlMigrator } from '../../../src/plugins/bootstrap/yaml-migrator.js';
import Plugin from '../../../src/database/models/plugin.models.js';
import Provider from '../../../src/database/models/provider.models.js';
import ChannelRouting from '../../../src/database/models/channel-routing.models.js';
import * as pluginFs from '../../../src/plugins/loader/plugin-fs.js';
import * as keypairManager from '../../../src/plugins/crypto/keypair-manager.js';
import { PluginSyncService } from '../../../src/plugins/sync/plugin-sync.service.js';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe('YamlMigrator Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(PluginSyncService, 'publish').mockResolvedValue(undefined);
    vi.spyOn(keypairManager, 'encryptCredentials').mockResolvedValue({
      encrypted_data: 'enc-data',
      iv: 'enc-iv',
      auth_tag: 'enc-tag',
      encrypted_dek: 'enc-dek',
    });
  });

  it('should skip migration if providers already exist in MongoDB', async () => {
    vi.spyOn(Provider, 'countDocuments').mockResolvedValue(2 as any);
    const findConfigSpy = vi.spyOn(pluginFs, 'findConfigFile');

    const result = await YamlMigrator.migrateYamlIfNeeded();

    expect(result).toBe(false);
    expect(findConfigSpy).not.toHaveBeenCalled();
  });

  it('should return false if no config file is found', async () => {
    vi.spyOn(Provider, 'countDocuments').mockResolvedValue(0 as any);
    vi.spyOn(pluginFs, 'findConfigFile').mockReturnValue(null);

    const result = await YamlMigrator.migrateYamlIfNeeded();

    expect(result).toBe(false);
  });

  it('should return false if config has no providers', async () => {
    vi.spyOn(Provider, 'countDocuments').mockResolvedValue(0 as any);
    vi.spyOn(pluginFs, 'findConfigFile').mockReturnValue('./simplens.config.yaml');
    vi.mocked(fs.readFileSync).mockReturnValue('channels: {}');

    const result = await YamlMigrator.migrateYamlIfNeeded();

    expect(result).toBe(false);
  });

  it('should skip provider creation and not create generic provider if npm install fails', async () => {
    vi.spyOn(Provider, 'countDocuments').mockResolvedValue(0 as any);
    vi.spyOn(pluginFs, 'findConfigFile').mockReturnValue('./simplens.config.yaml');
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue(`
providers:
  - id: broken-provider
    package: '@simplens/broken-pkg'
    credentials:
      apiKey: test-key
`);

    vi.spyOn(pluginFs, 'installNpmPackage').mockImplementation(() => {
      throw new Error('NPM install 404 Not Found');
    });
    const extractManifestSpy = vi.spyOn(pluginFs, 'extractPackageManifest');
    const providerUpsertSpy = vi.spyOn(Provider, 'findOneAndUpdate');
    const pluginUpsertSpy = vi.spyOn(Plugin, 'findOneAndUpdate');
    vi.spyOn(Plugin, 'findOne').mockResolvedValue(null);

    const result = await YamlMigrator.migrateYamlIfNeeded();

    // Migration returns false because 0 providers were migrated
    expect(result).toBe(false);
    // Manifest extraction shouldn't be called if install failed
    expect(extractManifestSpy).not.toHaveBeenCalled();
    // No Plugin record created
    expect(pluginUpsertSpy).not.toHaveBeenCalled();
    // CRUCIAL: No Provider record created, generic provider avoided
    expect(providerUpsertSpy).not.toHaveBeenCalled();
  });

  it('should skip provider creation if manifest extraction fails', async () => {
    vi.spyOn(Provider, 'countDocuments').mockResolvedValue(0 as any);
    vi.spyOn(pluginFs, 'findConfigFile').mockReturnValue('./simplens.config.yaml');
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue(`
providers:
  - id: broken-manifest-provider
    package: '@simplens/corrupted-pkg'
    credentials:
      apiKey: test-key
`);

    vi.spyOn(pluginFs, 'installNpmPackage').mockReturnValue(undefined);
    vi.spyOn(pluginFs, 'extractPackageManifest').mockRejectedValue(new Error('Invalid package manifest'));
    const providerUpsertSpy = vi.spyOn(Provider, 'findOneAndUpdate');
    const pluginUpsertSpy = vi.spyOn(Plugin, 'findOneAndUpdate');
    vi.spyOn(Plugin, 'findOne').mockResolvedValue(null);

    const result = await YamlMigrator.migrateYamlIfNeeded();

    expect(result).toBe(false);
    expect(pluginUpsertSpy).not.toHaveBeenCalled();
    expect(providerUpsertSpy).not.toHaveBeenCalled();
  });

  it('should migrate valid provider and omit failed provider, promoting fallback if default failed', async () => {
    vi.spyOn(Provider, 'countDocuments').mockResolvedValue(0 as any);
    vi.spyOn(pluginFs, 'findConfigFile').mockReturnValue('./simplens.config.yaml');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
providers:
  - id: default-email
    package: '@simplens/broken-email'
    credentials:
      key: val
  - id: fallback-email
    package: '@simplens/good-email'
    credentials:
      key: val
channels:
  email:
    default: default-email
    fallback:
      - fallback-email
`);

    // First package fails manifest, second succeeds
    vi.spyOn(pluginFs, 'extractPackageManifest').mockImplementation(async (pkg: string) => {
      if (pkg === '@simplens/broken-email') {
        throw new Error('Broken manifest');
      }
      return {
        manifest: {
          name: '@simplens/good-email',
          displayName: 'Good Email Provider',
          version: '1.0.0',
          channel: 'email',
          description: 'Good email provider',
          requiredCredentials: ['key'],
        },
        version: '1.0.0',
      };
    });

    const pluginUpsertSpy = vi.spyOn(Plugin, 'findOneAndUpdate').mockResolvedValue({} as any);
    const providerUpsertSpy = vi.spyOn(Provider, 'findOneAndUpdate').mockResolvedValue({} as any);
    const routingUpsertSpy = vi.spyOn(ChannelRouting, 'findOneAndUpdate').mockResolvedValue({} as any);

    vi.spyOn(Plugin, 'findOne').mockImplementation(async (query: any) => {
      if (query.name === '@simplens/good-email') {
        return {
          name: '@simplens/good-email',
          status: 'installed',
          manifest: { channel: 'email' },
        } as any;
      }
      return null;
    });

    vi.spyOn(Provider, 'findOne').mockImplementation(async (query: any) => {
      if (query.id === 'fallback-email' && query.channel === 'email') {
        return { id: 'fallback-email', channel: 'email' } as any;
      }
      return null;
    });

    const result = await YamlMigrator.migrateYamlIfNeeded();

    expect(result).toBe(true);

    // Only good-email plugin is saved
    expect(pluginUpsertSpy).toHaveBeenCalledTimes(1);
    expect(pluginUpsertSpy).toHaveBeenCalledWith(
      { name: '@simplens/good-email' },
      expect.objectContaining({ name: '@simplens/good-email', status: 'installed' }),
      expect.any(Object)
    );

    // Only fallback-email provider is created (with channel 'email')
    expect(providerUpsertSpy).toHaveBeenCalledTimes(1);
    expect(providerUpsertSpy).toHaveBeenCalledWith(
      { id: 'fallback-email' },
      expect.objectContaining({
        id: 'fallback-email',
        plugin_name: '@simplens/good-email',
        channel: 'email',
        enabled: true,
      }),
      expect.any(Object)
    );

    // Channel routing promoted fallback-email to default since default-email failed
    expect(routingUpsertSpy).toHaveBeenCalledWith(
      { channel: 'email' },
      expect.objectContaining({
        channel: 'email',
        default_provider_id: 'fallback-email',
        fallback_provider_ids: [],
      }),
      expect.any(Object)
    );
  });

  it('should migrate all providers and channel routings successfully when all succeed', async () => {
    vi.spyOn(Provider, 'countDocuments').mockResolvedValue(0 as any);
    vi.spyOn(pluginFs, 'findConfigFile').mockReturnValue('./simplens.config.yaml');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
providers:
  - id: resend-provider
    package: '@simplens/resend'
    credentials:
      apiKey: resend-123
channels:
  email:
    default: resend-provider
`);

    vi.spyOn(pluginFs, 'extractPackageManifest').mockResolvedValue({
      manifest: {
        name: '@simplens/resend',
        displayName: 'Resend Provider',
        version: '1.2.0',
        channel: 'email',
        description: 'Resend email provider',
        requiredCredentials: ['apiKey'],
      },
      version: '1.2.0',
    });

    vi.spyOn(Plugin, 'findOneAndUpdate').mockResolvedValue({} as any);
    vi.spyOn(Provider, 'findOneAndUpdate').mockResolvedValue({} as any);
    vi.spyOn(ChannelRouting, 'findOneAndUpdate').mockResolvedValue({} as any);

    vi.spyOn(Plugin, 'findOne').mockResolvedValue({
      name: '@simplens/resend',
      status: 'installed',
      manifest: { channel: 'email' },
    } as any);

    const publishSpy = vi.spyOn(PluginSyncService, 'publish');

    const result = await YamlMigrator.migrateYamlIfNeeded();

    expect(result).toBe(true);
    expect(Provider.findOneAndUpdate).toHaveBeenCalledWith(
      { id: 'resend-provider' },
      expect.objectContaining({
        id: 'resend-provider',
        plugin_name: '@simplens/resend',
        channel: 'email',
        enabled: true,
      }),
      expect.any(Object)
    );
    expect(ChannelRouting.findOneAndUpdate).toHaveBeenCalledWith(
      { channel: 'email' },
      expect.objectContaining({
        channel: 'email',
        default_provider_id: 'resend-provider',
      }),
      expect.any(Object)
    );
    expect(publishSpy).toHaveBeenCalledWith('SYSTEM_RELOAD', {});
  });
});
