#!/usr/bin/env node
/**
 * SimpleNS Plugin Installer
 * 
 * Installs a plugin and automatically updates simplens.config.yaml
 * using the plugin's manifest (channel, requiredCredentials).
 * 
 * Usage: node scripts/plugin-install.js <package-name>
 * Example: node scripts/plugin-install.js @simplens/gmail
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const PLUGINS_DIR = join(ROOT_DIR, '.plugins');
const PLUGINS_PACKAGE_JSON = join(PLUGINS_DIR, 'package.json');

// Supported config file patterns (in priority order)
const CONFIG_PATTERNS = [
    "simplens.config.yaml",
    "simplens.config.yml",
    "simplens.config.json"
]

function findConfigFile(patterns) {
    for (const filename of patterns) {
        const filepath = join(ROOT_DIR, filename);
        if (existsSync(filepath)) {
            return { path: filepath, filename };
        }
    }
    return null;
}

function parseConfigFile(filepath) {
    const content = readFileSync(filepath, 'utf-8');
    if (filepath.endsWith('.json')) {
        return JSON.parse(content);
    }
    return parseYaml(content);
}

function writeConfigFile(filepath, config) {
    if (filepath.endsWith('.json')) {
        writeFileSync(filepath, JSON.stringify(config, null, 2));
    } else {
        writeFileSync(filepath, stringifyYaml(config, { lineWidth: 0 }));
    }
}

function initPluginsDir() {
    if (!existsSync(PLUGINS_DIR)) {
        mkdirSync(PLUGINS_DIR, { recursive: true });
    }

    if (!existsSync(PLUGINS_PACKAGE_JSON)) {
        const initialPackage = {
            name: "simplens-plugins",
            version: "1.0.0",
            description: "User-installed SimpleNS plugins",
            private: true,
            type: "module",
            dependencies: {}
        };
        writeFileSync(PLUGINS_PACKAGE_JSON, JSON.stringify(initialPackage, null, 2));
    }
}

function ensureLocalConfig() {
    // Check if local config already exists
    const existingLocal = findConfigFile(CONFIG_PATTERNS);
    if (existingLocal) {
        return existingLocal.path;
    }

    const defaultLocalPath = join(ROOT_DIR, 'simplens.config.yaml');

    // No config exists at all - create minimal local config
    const minimalConfig = {
        providers: [],
        channels: {}
    };
    writeFileSync(defaultLocalPath, stringifyYaml(minimalConfig));
    console.log('📄 Created empty simplens.config.yaml');
    return defaultLocalPath;
}

async function getPluginManifest(packageName) {
    const pluginPath = join(PLUGINS_DIR, 'node_modules', packageName);
    const pluginPkgPath = join(pluginPath, 'package.json');

    try {
        // Read the plugin's package.json to find entry point
        if (!existsSync(pluginPkgPath)) {
            console.warn(`⚠️  Plugin package.json not found: ${pluginPkgPath}`);
            return null;
        }

        const pluginPkg = JSON.parse(readFileSync(pluginPkgPath, 'utf-8'));

        // Resolve entry point: exports > main > index.js
        let entryPoint = 'index.js';
        if (pluginPkg.exports) {
            // Handle exports field (can be string or object)
            if (typeof pluginPkg.exports === 'string') {
                entryPoint = pluginPkg.exports;
            } else if (pluginPkg.exports['.']) {
                const dotExport = pluginPkg.exports['.'];
                entryPoint = typeof dotExport === 'string'
                    ? dotExport
                    : (dotExport.import || dotExport.default || 'index.js');
            }
        } else if (pluginPkg.main) {
            entryPoint = pluginPkg.main;
        }

        const entryFilePath = join(pluginPath, entryPoint);
        const entryUrl = pathToFileURL(entryFilePath).href;

        // Dynamic import the plugin to get its manifest
        const module = await import(entryUrl);
        const ProviderClass = module.default;

        if (ProviderClass && ProviderClass.prototype) {
            // Instantiate to get manifest (class-based provider)
            const instance = new ProviderClass();
            return instance.manifest;
        } else if (typeof ProviderClass === 'object' && ProviderClass.manifest) {
            // Already an instance
            return ProviderClass.manifest;
        }
    } catch (err) {
        console.warn(`⚠️  Could not read plugin manifest: ${err.message}`);
    }

    return null;
}

function generateProviderId(packageName) {
    // Generate a unique ID from package name
    // @simplens/gmail -> gmail
    // @simplens/twilio-sms -> twilio-sms
    const baseName = packageName.replace(/^@simplens\//, '');
    return baseName;
}

function generateCredentialPlaceholders(requiredCredentials) {
    const creds = {};
    for (const cred of requiredCredentials) {
        // Convert credential name to env var format
        // e.g., "apiKey" -> "${API_KEY}", "refreshToken" -> "${REFRESH_TOKEN}"
        const envVar = cred.toUpperCase();
        creds[cred] = `\${${envVar}}`;
    }
    return creds;
}

function updateConfig(configPath, packageName, manifest) {
    const config = parseConfigFile(configPath) || {};

    if (!config.providers) config.providers = [];
    if (!config.channels) config.channels = {};

    const providerId = generateProviderId(packageName);

    // Check if provider already exists
    const existingIndex = config.providers.findIndex(p => p.package === packageName);
    if (existingIndex >= 0) {
        console.log(`ℹ️  Provider ${packageName} already in config, skipping config update`);
        return;
    }

    // Create provider entry from manifest
    const providerEntry = {
        package: packageName,
        id: providerId,
        credentials: generateCredentialPlaceholders(manifest.requiredCredentials || []),
        options: {
            priority: 1,
            rateLimit: {
                maxTokens: 100,
                refillRate: 10
            }
        }
    };

    config.providers.push(providerEntry);

    // Add channel mapping if channel doesn't have a default yet
    const channel = manifest.channel;
    if (channel && !config.channels[channel]) {
        config.channels[channel] = {
            default: providerId
        };
    }

    // Write updated config
    writeConfigFile(configPath, config);
    console.log(`✅ Updated ${configPath.split(/[/\\]/).pop()} with ${providerId} provider`);
}

async function installPlugin(packageName) {
    console.log(`\n📦 Installing plugin: ${packageName}\n`);

    initPluginsDir();
    const configPath = ensureLocalConfig();

    try {
        execSync(`npm install ${packageName}`, {
            cwd: PLUGINS_DIR,
            stdio: 'inherit'
        });

        console.log(`\n✅ Successfully installed ${packageName}`);

        // Read manifest and update config
        const manifest = await getPluginManifest(packageName);
        if (manifest) {
            console.log(`\n📋 Plugin manifest:`);
            console.log(`   Name: ${manifest.displayName || manifest.name}`);
            console.log(`   Channel: ${manifest.channel}`);
            console.log(`   Credentials: ${manifest.requiredCredentials?.join(', ') || 'none'}`);

            updateConfig(configPath, packageName, manifest);
        }

        console.log(`\n📝 Next steps:`);
        console.log(`   1. Edit simplens.config.yaml to fill in credential values`);
        console.log(`   2. Set the corresponding environment variables`);
        console.log(`   3. Restart SimpleNS to load the new provider\n`);
    } catch (error) {
        console.error(`\n❌ Failed to install ${packageName}`);
        process.exit(1);
    }
}

// Main
const packageName = process.argv[2];
if (!packageName) {
    console.error('Usage: npm run plugin:install <package-name>');
    console.error('Example: npm run plugin:install @simplens/gmail');
    process.exit(1);
}

installPlugin(packageName);
