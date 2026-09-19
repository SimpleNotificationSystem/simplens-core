/**
 * NPM Authentication & Registry Configuration Service
 * 
 * Manages npm access tokens and enterprise registry configurations,
 * encrypted storage in MongoDB, and synchronization of .plugins/.npmrc.
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import system_config_model from '@src/database/models/system-config.models.js';
import { getOrCreateEncryptionKey } from '@src/admin-alerts/key-manager.js';
import { encrypt, decrypt } from '@src/utils/encryption.utils.js';
import { PluginSyncService } from '@src/plugins/sync/plugin-sync.service.js';
import { PLUGINS_DIR, initPluginsDir } from '@src/plugins/loader/plugin-fs.js';
import type { encrypted_config, npm_auth_status } from '@src/types/types.js';
import { pluginLoaderLogger as logger } from '@src/workers/utils/logger.js';

export const NPM_AUTH_CONFIG_KEY = 'npm_auth_config';
export const NPMRC_PATH = join(PLUGINS_DIR, '.npmrc');

interface StoredNpmAuthConfig {
  encrypted_token: encrypted_config;
  registry_url: string;
}

/**
 * Extract npm scope from a package name if present
 * E.g. "@simplens/resend" -> "@simplens", "lodash" -> undefined
 */
export function extractScope(packageName: string): string | undefined {
  const match = packageName.trim().match(/^(@[a-zA-Z0-9~_.-]+)\//);
  return match ? match[1] : undefined;
}

/**
 * Format a registry URL into an .npmrc auth token line
 * E.g. "https://registry.npmjs.org/" -> "//registry.npmjs.org/:_authToken=..."
 */
export function toNpmrcTokenLine(registryUrl: string, token: string): string {
  try {
    const url = new URL(registryUrl);
    let hostPath = url.host + url.pathname;
    if (!hostPath.endsWith('/')) {
      hostPath += '/';
    }
    return `//${hostPath}:_authToken=${token.trim()}`;
  } catch {
    return `//registry.npmjs.org/:_authToken=${token.trim()}`;
  }
}

export class NpmAuthService {
  /**
   * Retrieve active npm auth credentials from MongoDB or process.env
   */
  public static async getDecryptedToken(): Promise<{ token: string; registry_url: string } | null> {
    try {
      const doc = await system_config_model.findOne({ key: NPM_AUTH_CONFIG_KEY }).lean();
      if (doc?.value) {
        const stored = doc.value as StoredNpmAuthConfig;
        if (stored.encrypted_token) {
          const key = await getOrCreateEncryptionKey();
          const token = decrypt(stored.encrypted_token, key);
          return {
            token,
            registry_url: stored.registry_url || 'https://registry.npmjs.org/',
          };
        }
      }
    } catch (err) {
      logger.error('Failed to decrypt stored npm token from MongoDB:', err);
    }

    // Fall back to environment variable if present
    const envToken = process.env.NPM_TOKEN || process.env.NPM_AUTH_TOKEN;
    if (envToken) {
      return {
        token: envToken,
        registry_url: process.env.NPM_REGISTRY_URL || 'https://registry.npmjs.org/',
      };
    }

    return null;
  }

  /**
   * Get public status of configured npm auth (with masked token)
   */
  public static async getAuthStatus(): Promise<npm_auth_status> {
    const auth = await this.getDecryptedToken();
    if (!auth || !auth.token) {
      return {
        is_configured: false,
      };
    }

    const t = auth.token;
    const masked = t.length > 8
      ? `${t.slice(0, 4)}****${t.slice(-4)}`
      : '****';

    return {
      is_configured: true,
      registry_url: auth.registry_url,
      masked_token: masked,
    };
  }

  /**
   * Save and encrypt npm auth configuration in MongoDB, sync .npmrc, and broadcast
   */
  public static async saveNpmAuth(token: string, registryUrl?: string): Promise<npm_auth_status> {
    const cleanToken = token.trim();
    const cleanRegistry = registryUrl?.trim() || 'https://registry.npmjs.org/';

    const key = await getOrCreateEncryptionKey();
    const encryptedToken = encrypt(cleanToken, key);

    const storedValue: StoredNpmAuthConfig = {
      encrypted_token: encryptedToken,
      registry_url: cleanRegistry,
    };

    await system_config_model.findOneAndUpdate(
      { key: NPM_AUTH_CONFIG_KEY },
      { key: NPM_AUTH_CONFIG_KEY, value: storedValue },
      { upsert: true, new: true }
    );

    await this.syncNpmrc();
    await PluginSyncService.publish('NPM_AUTH_UPDATED', {});

    logger.success(`npm auth configuration saved and broadcasted successfully for ${cleanRegistry}`);
    return this.getAuthStatus();
  }

  /**
   * Delete saved npm auth configuration, sync .npmrc, and broadcast
   */
  public static async deleteNpmAuth(): Promise<void> {
    await system_config_model.deleteOne({ key: NPM_AUTH_CONFIG_KEY });
    await this.syncNpmrc();
    await PluginSyncService.publish('NPM_AUTH_UPDATED', {});
    logger.info('npm auth configuration removed and broadcasted');
  }

  /**
   * Generate and write .plugins/.npmrc
   * Supports optional inline scope/registry/token for one-off private installs
   */
  public static async syncNpmrc(temporaryOverride?: {
    scope?: string;
    registryUrl?: string;
    token?: string;
  }): Promise<void> {
    initPluginsDir();

    const lines: string[] = [
      '# Auto-generated by SimpleNS - do not edit manually',
      'package-lock=false',
    ];

    const activeAuth = await this.getDecryptedToken();

    // 1. Configured persistent auth
    if (activeAuth && activeAuth.token) {
      const isCustomRegistry = activeAuth.registry_url && !activeAuth.registry_url.includes('registry.npmjs.org');
      if (isCustomRegistry) {
        lines.push(`registry=${activeAuth.registry_url}`);
      }
      lines.push(toNpmrcTokenLine(activeAuth.registry_url, activeAuth.token));
    }

    // 2. Temporary/Inline override (e.g. for a specific scoped install)
    if (temporaryOverride?.token) {
      const targetRegistry = temporaryOverride.registryUrl || 'https://registry.npmjs.org/';
      if (temporaryOverride.scope) {
        lines.push(`${temporaryOverride.scope}:registry=${targetRegistry}`);
      } else if (!targetRegistry.includes('registry.npmjs.org')) {
        lines.push(`registry=${targetRegistry}`);
      }
      lines.push(toNpmrcTokenLine(targetRegistry, temporaryOverride.token));
    }

    const content = lines.join('\n') + '\n';
    try {
      writeFileSync(NPMRC_PATH, content, { encoding: 'utf-8', mode: 0o600 });
      logger.debug(`Synchronized .npmrc in ${PLUGINS_DIR}`);
    } catch (err) {
      logger.error('Failed to write .npmrc:', err);
    }
  }

  /**
   * Register remote synchronization handlers with Redis Pub/Sub
   */
  public static registerSyncHandlers(): void {
    PluginSyncService.on('NPM_AUTH_UPDATED', async () => {
      logger.info('Sync: Received NPM_AUTH_UPDATED event, refreshing .npmrc...');
      await NpmAuthService.syncNpmrc();
    });
  }
}
