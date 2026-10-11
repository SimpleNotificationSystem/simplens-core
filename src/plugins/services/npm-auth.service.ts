/**
 * NPM Authentication & Registry Configuration Service
 * 
 * Manages multiple npm access tokens and enterprise registry configurations,
 * encrypted storage in MongoDB, and synchronization of .plugins/.npmrc.
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import system_config_model from '@src/database/models/system-config.models.js';
import { getOrCreateEncryptionKey } from '@src/admin-alerts/key-manager.js';
import { encrypt, decrypt } from '@src/utils/encryption.utils.js';
import { PluginSyncService } from '@src/plugins/sync/plugin-sync.service.js';
import { PLUGINS_DIR, initPluginsDir } from '@src/plugins/loader/plugin-fs.js';
import type {
  encrypted_config,
  npm_auth_status,
  npm_registry_status,
} from '@src/types/types.js';
import { pluginLoaderLogger as logger } from '@src/workers/utils/logger.js';

export const NPM_AUTH_CONFIG_KEY = 'npm_auth_config';
export const NPMRC_PATH = join(PLUGINS_DIR, '.npmrc');

interface StoredRegistryEntry {
  id: string;
  scope?: string;
  registry_url: string;
  encrypted_token: encrypted_config;
  updated_at: string;
}

interface StoredNpmAuthConfig {
  registries?: StoredRegistryEntry[];
  // Legacy fields for backwards compatibility
  encrypted_token?: encrypted_config;
  registry_url?: string;
}

export interface DecryptedRegistryEntry {
  id: string;
  scope?: string;
  registry_url: string;
  token: string;
  updated_at: string;
}

/**
 * Extract npm scope from a package name if present
 * E.g. "@simplens/resend" -> "@simplens", "lodash" -> undefined
 */
export function extractScope(packageName: string): string | undefined {
  const match = packageName.trim().match(/^(@[a-zA-Z0-9~_.-]+)\//);
  return match ? match[1].toLowerCase() : undefined;
}

/**
 * Normalize npm registry URL to ensure valid URL with trailing slash
 */
export function normalizeRegistryUrl(registryUrl?: string): string {
  if (!registryUrl || !registryUrl.trim()) {
    return 'https://registry.npmjs.org/';
  }
  let trimmed = registryUrl.trim();
  if (!trimmed.endsWith('/')) {
    trimmed += '/';
  }
  return trimmed;
}

/**
 * Generate a consistent identifier for a registry entry
 */
export function generateRegistryId(scope?: string, registryUrl?: string): string {
  if (scope) {
    return `scope:${scope.trim().toLowerCase()}`;
  }
  const normalized = normalizeRegistryUrl(registryUrl);
  if (!normalized.includes('registry.npmjs.org')) {
    try {
      return `url:${new URL(normalized).host.toLowerCase()}`;
    } catch {
      // fallback
    }
  }
  return 'default';
}

/**
 * Mask an authentication token for safe public/UI presentation
 */
export function maskToken(token: string): string {
  const t = token.trim();
  return t.length > 8 ? `${t.slice(0, 4)}****${t.slice(-4)}` : '****';
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
   * Retrieve all stored registry entries, migrating legacy single-token documents if present
   */
  private static async getRawStoredEntries(): Promise<StoredRegistryEntry[]> {
    try {
      const doc = await system_config_model.findOne({ key: NPM_AUTH_CONFIG_KEY }).lean();
      if (!doc?.value) {
        return [];
      }

      const stored = doc.value as StoredNpmAuthConfig;
      const entries: StoredRegistryEntry[] = [];

      if (Array.isArray(stored.registries) && stored.registries.length > 0) {
        entries.push(...stored.registries);
      } else if (stored.encrypted_token) {
        // Migrate legacy single-token document
        const regUrl = normalizeRegistryUrl(stored.registry_url);
        entries.push({
          id: generateRegistryId(undefined, regUrl),
          registry_url: regUrl,
          encrypted_token: stored.encrypted_token,
          updated_at: new Date().toISOString(),
        });
      }

      return entries;
    } catch (err) {
      logger.error('Failed to read npm registries from MongoDB:', err);
      return [];
    }
  }

  /**
   * Retrieve all decrypted registry configurations from MongoDB + environment variables
   */
  public static async getDecryptedRegistries(): Promise<DecryptedRegistryEntry[]> {
    const entries = await this.getRawStoredEntries();
    const result: DecryptedRegistryEntry[] = [];

    if (entries.length > 0) {
      try {
        const key = await getOrCreateEncryptionKey();
        for (const entry of entries) {
          try {
            const token = decrypt(entry.encrypted_token, key);
            result.push({
              id: entry.id,
              scope: entry.scope,
              registry_url: normalizeRegistryUrl(entry.registry_url),
              token,
              updated_at: entry.updated_at,
            });
          } catch (decErr) {
            logger.error(`Failed to decrypt token for registry ${entry.id}:`, decErr);
          }
        }
      } catch (keyErr) {
        logger.error('Failed to get encryption key for npm registries:', keyErr);
      }
    }

    // Include environment variable fallback if not already present
    const envToken = process.env.NPM_TOKEN || process.env.NPM_AUTH_TOKEN;
    if (envToken) {
      const envRegUrl = normalizeRegistryUrl(process.env.NPM_REGISTRY_URL);
      const exists = result.some(r => r.registry_url === envRegUrl && !r.scope);
      if (!exists) {
        result.push({
          id: 'env-default',
          registry_url: envRegUrl,
          token: envToken,
          updated_at: new Date().toISOString(),
        });
      }
    }

    return result;
  }

  /**
   * Retrieve active npm auth credentials (backwards-compatible helper)
   */
  public static async getDecryptedToken(): Promise<{ token: string; registry_url: string } | null> {
    const registries = await this.getDecryptedRegistries();
    if (registries.length > 0) {
      const primary = registries[0];
      return {
        token: primary.token,
        registry_url: primary.registry_url,
      };
    }
    return null;
  }

  /**
   * Find matching credentials for a given package name and/or target registry URL
   */
  public static async findMatchingAuth(
    packageName: string,
    registryUrl?: string
  ): Promise<DecryptedRegistryEntry | null> {
    const registries = await this.getDecryptedRegistries();
    if (registries.length === 0) {
      return null;
    }

    const scope = extractScope(packageName);
    const targetUrl = registryUrl ? normalizeRegistryUrl(registryUrl) : undefined;

    // 1. Try matching by package scope (e.g. "@myenterprise")
    if (scope) {
      const scopeMatch = registries.find(r => r.scope?.toLowerCase() === scope);
      if (scopeMatch) {
        return scopeMatch;
      }
    }

    // 2. Try matching by target registry URL host
    if (targetUrl) {
      try {
        const targetHost = new URL(targetUrl).host.toLowerCase();
        const urlMatch = registries.find(r => {
          try {
            return new URL(r.registry_url).host.toLowerCase() === targetHost;
          } catch {
            return false;
          }
        });
        if (urlMatch) {
          return urlMatch;
        }
      } catch {
        // invalid URL ignore
      }
    }

    // 3. Fallback: If target is default npmjs or unspecifed, find default/global registry
    const defaultMatch = registries.find(r => !r.scope && r.registry_url.includes('registry.npmjs.org'));
    if (defaultMatch) {
      return defaultMatch;
    }

    // 4. Return first registry if no specific match and it's a global entry
    const anyGlobal = registries.find(r => !r.scope);
    return anyGlobal || null;
  }

  /**
   * Get public status of all configured registries (with masked tokens)
   */
  public static async getAuthStatus(): Promise<npm_auth_status> {
    const registries = await this.getDecryptedRegistries();
    if (registries.length === 0) {
      return {
        is_configured: false,
        registries: [],
      };
    }

    const registryStatuses: npm_registry_status[] = registries.map(r => ({
      id: r.id,
      scope: r.scope,
      registry_url: r.registry_url,
      masked_token: maskToken(r.token),
      updated_at: r.updated_at,
    }));

    const primary = registries[0];
    return {
      is_configured: true,
      registries: registryStatuses,
      default_registry: primary.registry_url,
      masked_token: maskToken(primary.token),
    };
  }

  /**
   * Save and encrypt npm auth configuration for a scope or registry in MongoDB
   */
  public static async saveNpmAuth(
    token: string,
    registryUrl?: string,
    scope?: string
  ): Promise<npm_auth_status> {
    const cleanToken = token.trim();
    const cleanRegistry = normalizeRegistryUrl(registryUrl);
    const cleanScope = scope?.trim() ? (scope.startsWith('@') ? scope.trim().toLowerCase() : `@${scope.trim().toLowerCase()}`) : undefined;
    const entryId = generateRegistryId(cleanScope, cleanRegistry);

    const key = await getOrCreateEncryptionKey();
    const encryptedToken = encrypt(cleanToken, key);

    const currentEntries = await this.getRawStoredEntries();
    const existingIndex = currentEntries.findIndex(e => e.id === entryId || (cleanScope && e.scope === cleanScope));

    const newEntry: StoredRegistryEntry = {
      id: entryId,
      scope: cleanScope,
      registry_url: cleanRegistry,
      encrypted_token: encryptedToken,
      updated_at: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      currentEntries[existingIndex] = newEntry;
    } else {
      currentEntries.push(newEntry);
    }

    const storedValue: StoredNpmAuthConfig = {
      registries: currentEntries,
      // Clear legacy single fields to prevent ambiguity
      encrypted_token: undefined,
      registry_url: undefined,
    };

    await system_config_model.findOneAndUpdate(
      { key: NPM_AUTH_CONFIG_KEY },
      { key: NPM_AUTH_CONFIG_KEY, value: storedValue },
      { upsert: true, new: true }
    );

    await this.syncNpmrc();
    await PluginSyncService.publish('NPM_AUTH_UPDATED', {});

    logger.success(`npm auth configuration saved and broadcasted for ${cleanScope || cleanRegistry} (${entryId})`);
    return this.getAuthStatus();
  }

  /**
   * Delete saved npm auth configuration by ID, scope, or delete all
   */
  public static async deleteNpmAuth(idOrScope?: string): Promise<void> {
    if (!idOrScope || idOrScope === 'all') {
      await system_config_model.deleteOne({ key: NPM_AUTH_CONFIG_KEY });
      logger.info('All npm auth configurations removed');
    } else {
      const currentEntries = await this.getRawStoredEntries();
      const target = idOrScope.trim().toLowerCase();
      const filtered = currentEntries.filter(
        e => e.id.toLowerCase() !== target && e.scope?.toLowerCase() !== target && e.registry_url.toLowerCase() !== target
      );

      const storedValue: StoredNpmAuthConfig = {
        registries: filtered,
        encrypted_token: undefined,
        registry_url: undefined,
      };

      await system_config_model.findOneAndUpdate(
        { key: NPM_AUTH_CONFIG_KEY },
        { key: NPM_AUTH_CONFIG_KEY, value: storedValue },
        { upsert: true, new: true }
      );
      logger.info(`Removed npm auth configuration for ${idOrScope}`);
    }

    await this.syncNpmrc();
    await PluginSyncService.publish('NPM_AUTH_UPDATED', {});
  }

  /**
   * Generate and write .plugins/.npmrc containing all scoped and host credentials
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

    const registries = await this.getDecryptedRegistries();
    const writtenHosts = new Set<string>();
    const writtenScopes = new Set<string>();

    // 1. Process all persistent registries
    for (const reg of registries) {
      if (reg.scope && !writtenScopes.has(reg.scope)) {
        if (!reg.registry_url.includes('registry.npmjs.org')) {
          lines.push(`${reg.scope}:registry=${reg.registry_url}`);
        }
        writtenScopes.has(reg.scope);
      }

      const hostLine = toNpmrcTokenLine(reg.registry_url, reg.token);
      if (!writtenHosts.has(hostLine)) {
        lines.push(hostLine);
        writtenHosts.add(hostLine);
      }

      // If global custom registry with no scope
      if (!reg.scope && !reg.registry_url.includes('registry.npmjs.org')) {
        lines.push(`registry=${reg.registry_url}`);
      }
    }

    // 2. Temporary/Inline override (e.g. for a specific scoped install)
    if (temporaryOverride?.token) {
      const targetRegistry = normalizeRegistryUrl(temporaryOverride.registryUrl);
      if (temporaryOverride.scope) {
        const cleanScope = temporaryOverride.scope.startsWith('@')
          ? temporaryOverride.scope.toLowerCase()
          : `@${temporaryOverride.scope.toLowerCase()}`;
        lines.push(`${cleanScope}:registry=${targetRegistry}`);
      } else if (!targetRegistry.includes('registry.npmjs.org')) {
        lines.push(`registry=${targetRegistry}`);
      }
      const overrideHostLine = toNpmrcTokenLine(targetRegistry, temporaryOverride.token);
      if (!writtenHosts.has(overrideHostLine)) {
        lines.push(overrideHostLine);
        writtenHosts.add(overrideHostLine);
      }
    }

    const content = lines.join('\n') + '\n';
    try {
      writeFileSync(NPMRC_PATH, content, { encoding: 'utf-8', mode: 0o600 });
      logger.debug(`Synchronized .npmrc in ${PLUGINS_DIR} with ${registries.length} registries`);
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
