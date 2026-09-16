/**
 * Plugin File System & Package Utilities
 * 
 * Manages local .plugins directory, dynamic imports, manifest extraction,
 * and npm package installation/uninstallation.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { pathToFileURL } from 'url';
import type { SimpleNSProvider, ProviderManifest } from '@src/types/types.js';
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

  const provider = await importAndInstantiateProvider(packageName);
  if (!provider.manifest) {
    throw new Error(`Plugin '${packageName}' does not export a valid manifest property.`);
  }

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
  initPluginsDir();
  const specifier = version && version !== 'latest' ? `${packageName}@${version}` : `${packageName}@latest`;
  logger.info(`Running npm install ${specifier} in ${PLUGINS_DIR}...`);

  try {
    execSync(`npm install ${specifier}`, {
      cwd: PLUGINS_DIR,
      stdio: 'pipe',
    });
    logger.success(`Successfully installed ${specifier}`);
  } catch (err) {
    logger.error(`Failed to install ${specifier}:`, err);
    throw new Error(`Failed to install package: ${specifier}`, { cause: err });
  }
}

/**
 * Uninstall an npm package from .plugins
 */
export function uninstallNpmPackage(packageName: string): void {
  initPluginsDir();
  logger.info(`Running npm uninstall ${packageName} in ${PLUGINS_DIR}...`);

  try {
    execSync(`npm uninstall ${packageName}`, {
      cwd: PLUGINS_DIR,
      stdio: 'pipe',
    });
    logger.success(`Successfully uninstalled ${packageName}`);
  } catch (err) {
    logger.error(`Failed to uninstall ${packageName}:`, err);
    throw new Error(`Failed to uninstall package: ${packageName}`, { cause: err });
  }
}
