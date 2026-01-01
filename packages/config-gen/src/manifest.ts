/**
 * Manifest Extractor
 * 
 * Extracts provider manifests from installed plugin packages.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

export interface ProviderManifest {
    name: string;
    version: string;
    channel: string;
    displayName: string;
    description: string;
    requiredCredentials: string[];
    optionalConfig?: string[];
}

/**
 * Extract manifest from an installed plugin package
 */
export async function extractManifest(tempDir: string, packageName: string): Promise<ProviderManifest> {
    const pluginPath = join(tempDir, 'node_modules', packageName);
    const pkgJsonPath = join(pluginPath, 'package.json');

    if (!existsSync(pkgJsonPath)) {
        throw new Error(`Plugin not found: ${packageName}`);
    }

    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));

    // Resolve entry point from package.json
    let entryPoint = 'index.js';
    if (pkgJson.exports) {
        if (typeof pkgJson.exports === 'string') {
            entryPoint = pkgJson.exports;
        } else if (pkgJson.exports['.']) {
            const dotExport = pkgJson.exports['.'];
            entryPoint = typeof dotExport === 'string'
                ? dotExport
                : (dotExport.import || dotExport.default || 'index.js');
        }
    } else if (pkgJson.main) {
        entryPoint = pkgJson.main;
    }

    const entryPath = join(pluginPath, entryPoint);

    if (!existsSync(entryPath)) {
        throw new Error(`Entry file not found: ${entryPath}`);
    }

    // Dynamic import the plugin module
    const module = await import(pathToFileURL(entryPath).href);
    const Provider = module.default;

    // Instantiate to get manifest
    if (typeof Provider === 'function') {
        const instance = new Provider();
        if (!instance.manifest) {
            throw new Error(`Plugin ${packageName} does not have a manifest property`);
        }
        return instance.manifest;
    } else if (Provider?.manifest) {
        return Provider.manifest;
    }

    throw new Error(`Could not extract manifest from ${packageName}. Make sure it exports a valid SimpleNS provider.`);
}
