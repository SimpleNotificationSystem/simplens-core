/**
 * Plugin File System & Package Utilities
 * 
 * Manages local .plugins directory, dynamic imports, manifest extraction,
 * and npm package installation/uninstallation.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';
import type { SimpleNSProvider, ProviderManifest } from '@src/types/types.js';
import {
  providerManifestSchema,
  npmPackageNameSchema,
  npmPackageVersionSchema,
} from '@src/types/schemas.js';
import { pluginLoaderLogger as logger } from '@src/workers/utils/logger.js';

export const PLUGINS_DIR = join(process.cwd(), '.plugins');
export const PLUGINS_NODE_MODULES = join(PLUGINS_DIR, 'node_modules');

/**
 * Resolve environment variables in credentials (${VAR_NAME} syntax)
 */
export function resolveCredentials(credentials: Record<string, string> | undefined): Record<string, string> {
  const resolved: Record<string, string> = {};

  for (const [key, value] of Object.entries(credentials || {})) {
    if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
      const envVar = value.slice(2, -1);
      const envValue = process.env[envVar];
      if (!envValue) {
        logger.warn(`Environment variable ${envVar} not set`);
      }
      resolved[key] = envValue || '';
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

/**
 * Resolve optional config from environment variables (${VAR_NAME} syntax)
 */
export function resolveOptionalConfig(
  optionalConfig: Record<string, string> | undefined
): Record<string, string> {
  const resolved: Record<string, string> = {};
  if (!optionalConfig) return resolved;

  for (const [key, value] of Object.entries(optionalConfig)) {
    if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
      const envVar = value.slice(2, -1);
      const envValue = process.env[envVar];
      if (envValue) {
        resolved[key] = envValue;
        logger.debug(`Loaded optional config: ${key}`);
      }
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

/**
 * Find local config file if it exists
 */
export function findConfigFile(basePath?: string): string | null {
  const customPath = process.env.SIMPLENS_CONFIG_PATH;
  if (customPath && existsSync(customPath)) {
    return customPath;
  }

  const dir = basePath ? basePath.substring(0, basePath.lastIndexOf('/') + 1) || './' : './';
  const candidates = [
    dir + 'simplens.config.yaml',
    dir + 'simplens.config.yml',
    dir + 'simplens.config.json',
    join(process.cwd(), 'simplens.config.yaml'),
    join(process.cwd(), 'simplens.config.yml'),
    join(process.cwd(), 'simplens.config.json'),
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Initialize plugins directory with package.json if needed
 */
export function initPluginsDir(): void {
  if (!existsSync(PLUGINS_DIR)) {
    mkdirSync(PLUGINS_DIR, { recursive: true });
  }

  const packageJsonPath = join(PLUGINS_DIR, 'package.json');
  if (!existsSync(packageJsonPath)) {
    const initialPackage = {
      name: 'simplens-plugins',
      version: '1.0.0',
      description: 'User-installed SimpleNS plugins',
      private: true,
      type: 'module',
      dependencies: {},
    };
    writeFileSync(packageJsonPath, JSON.stringify(initialPackage, null, 2));
  }
}

/**
 * Resolve the entry file for a package from its package.json
 */
export function resolvePackageEntry(packagePath: string): string {
  const pkgJsonPath = join(packagePath, 'package.json');
  if (!existsSync(pkgJsonPath)) {
    return join(packagePath, 'index.js');
  }

  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));

  let entryPoint = 'index.js';
  if (pkg.exports) {
    if (typeof pkg.exports === 'string') {
      entryPoint = pkg.exports;
    } else if (pkg.exports['.']) {
      const dotExport = pkg.exports['.'];
      entryPoint =
        typeof dotExport === 'string'
          ? dotExport
          : dotExport.import || dotExport.default || 'index.js';
    }
  } else if (pkg.main) {
    entryPoint = pkg.main;
  }

  return join(packagePath, entryPoint);
}

/**
 * Helper to instantiate provider from imported module
 */
export function instantiateFromModule(
  module: Record<string, unknown>,
  packageName: string
): SimpleNSProvider {
  if (module.default) {
    if (typeof module.default === 'function') {
      const DefaultExport = module.default as new () => SimpleNSProvider;
      if (DefaultExport.prototype?.constructor) {
        return new DefaultExport();
      }
      return (module.default as () => SimpleNSProvider)();
    }
    return module.default as SimpleNSProvider;
  }
  if (module.createProvider) {
    return (module.createProvider as () => SimpleNSProvider)();
  }
  throw new Error(`Package ${packageName} does not export a provider`);
}

/**
 * Dynamically import a provider package and instantiate
 */
export async function importAndInstantiateProvider(packageName: string): Promise<SimpleNSProvider> {
  try {
    const pluginPath = join(PLUGINS_NODE_MODULES, packageName);
    if (existsSync(pluginPath)) {
      logger.debug(`Loading from plugins directory: ${packageName}`);
      const entryFile = resolvePackageEntry(pluginPath);
      const pluginUrl = pathToFileURL(entryFile).href;
      const module = (await import(pluginUrl)) as Record<string, unknown>;
      return instantiateFromModule(module, packageName);
    }

    // Fall back to core node_modules (for bundled plugins or testing)
    const module = (await import(packageName)) as Record<string, unknown>;
    return instantiateFromModule(module, packageName);
  } catch (_err) {
    if (packageName.startsWith('./') || packageName.startsWith('../')) {
      const module = (await import(packageName)) as Record<string, unknown>;
      return instantiateFromModule(module, packageName);
    }
    const wrappedErr = new Error(`Plugin not found: ${packageName}. Install with npm or dashboard.`);
    (wrappedErr as unknown as Record<string, unknown>).cause = _err;
    throw wrappedErr;
  }
}

/**
 * Validate that an instantiated object strictly satisfies the SimpleNSProvider contract
 */
export function validateSimpleNSProvider(
  provider: unknown,
  packageName: string
): SimpleNSProvider {
  if (!provider || typeof provider !== 'object') {
    throw new Error(
      `Package '${packageName}' is not a valid SimpleNS plugin: default export must be a Provider object or class.`
    );
  }

  const p = provider as Record<string, unknown>;

  if (!p.manifest || typeof p.manifest !== 'object') {
    throw new Error(
      `Package '${packageName}' is not a valid SimpleNS plugin: missing 'manifest' definition.`
    );
  }

  const manifestValidation = providerManifestSchema.safeParse(p.manifest);
  if (!manifestValidation.success) {
    const errorDetails = Object.entries(manifestValidation.error.flatten().fieldErrors)
      .map(([k, v]) => `${k}: ${v?.join(', ')}`)
      .join('; ');
    throw new Error(
      `Package '${packageName}' has an invalid plugin manifest: ${errorDetails}`
    );
  }

  const requiredMethods: (keyof SimpleNSProvider)[] = [
    'send',
    'initialize',
    'healthCheck',
    'shutdown',
    'getNotificationSchema',
    'getRecipientSchema',
    'getContentSchema',
    'getRateLimitConfig',
  ];

  const missingMethods = requiredMethods.filter((method) => typeof p[method] !== 'function');

  if (missingMethods.length > 0) {
    throw new Error(
      `Package '${packageName}' is not a valid SimpleNS plugin. Missing required provider methods: ${missingMethods.join(', ')}`
    );
  }

  return provider as SimpleNSProvider;
}

/**
 * Extract manifest and authoritative package.json version from an installed package
 */
export async function extractPackageManifest(
  packageName: string
): Promise<{ manifest: ProviderManifest; version: string }> {
  let packageDir = join(PLUGINS_NODE_MODULES, packageName);
  if (!existsSync(packageDir)) {
    // Fall back to root node_modules if present
    packageDir = join(process.cwd(), 'node_modules', packageName);
  }

  const pkgJsonPath = join(packageDir, 'package.json');
  if (!existsSync(pkgJsonPath)) {
    throw new Error(`package.json not found for installed plugin '${packageName}'`);
  }

  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
  const version: string = pkgJson.version || '1.0.0';

  const rawProvider = await importAndInstantiateProvider(packageName);
  const provider = validateSimpleNSProvider(rawProvider, packageName);

  // Ensure manifest version matches package.json
  const manifest: ProviderManifest = {
    ...provider.manifest,
    version,
  };

  return { manifest, version };
}

/**
 * Install an npm package into .plugins
 */
export function installNpmPackage(packageName: string, version?: string): void {
  const pkgValidation = npmPackageNameSchema.safeParse(packageName);
  if (!pkgValidation.success) {
    throw new Error(`Invalid npm package name '${packageName}'`);
  }
  if (version && version !== 'latest') {
    const verValidation = npmPackageVersionSchema.safeParse(version);
    if (!verValidation.success) {
      throw new Error(`Invalid npm package version '${version}'`);
    }
  }

  initPluginsDir();
  const specifier = version && version !== 'latest' ? `${packageName}@${version}` : `${packageName}@latest`;
  logger.info(`Running npm install ${specifier} in ${PLUGINS_DIR}...`);

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCmd, ['install', specifier], {
    cwd: PLUGINS_DIR,
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0 || result.error) {
    const stderrMsg = result.stderr ? result.stderr.toString('utf-8') : (result.error?.message || '');
    logger.error(`Failed to install ${specifier}:`, stderrMsg || result.error);

    let friendlyMessage = `Failed to install package '${specifier}'`;
    if (stderrMsg.includes('E401') || stderrMsg.includes('401 Unauthorized')) {
      friendlyMessage = `npm authentication failed (401 Unauthorized) for package '${packageName}'. Verify your npm token.`;
    } else if (stderrMsg.includes('E404') || stderrMsg.includes('404 Not Found')) {
      friendlyMessage = `Package '${packageName}' was not found (404 Not Found) on npm registry.`;
    } else if (stderrMsg.includes('ETARGET')) {
      friendlyMessage = `Version '${version}' not found for package '${packageName}'.`;
    } else if (stderrMsg.trim()) {
      friendlyMessage += `: ${stderrMsg.trim().slice(0, 300)}`;
    }

    throw new Error(friendlyMessage, { cause: result.error });
  }

  logger.success(`Successfully installed ${specifier}`);
}

/**
 * Uninstall an npm package from .plugins
 */
export function uninstallNpmPackage(packageName: string): void {
  const pkgValidation = npmPackageNameSchema.safeParse(packageName);
  if (!pkgValidation.success) {
    throw new Error(`Invalid npm package name '${packageName}'`);
  }

  initPluginsDir();
  logger.info(`Running npm uninstall ${packageName} in ${PLUGINS_DIR}...`);

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCmd, ['uninstall', packageName], {
    cwd: PLUGINS_DIR,
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0 || result.error) {
    const stderrMsg = result.stderr ? result.stderr.toString('utf-8') : (result.error?.message || '');
    logger.error(`Failed to uninstall ${packageName}:`, stderrMsg || result.error);
    throw new Error(`Failed to uninstall package: ${packageName}`, { cause: result.error });
  }

  logger.success(`Successfully uninstalled ${packageName}`);
}
