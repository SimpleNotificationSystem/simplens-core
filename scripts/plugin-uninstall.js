#!/usr/bin/env node
/**
 * SimpleNS Plugin Uninstaller
 * 
 * Uninstalls a plugin and automatically removes its entries from simplens.config.yaml
 * 
 * Usage: node scripts/plugin-uninstall.js <package-name>
 * Example: node scripts/plugin-uninstall.js @simplens/mock
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const PLUGINS_DIR = join(ROOT_DIR, '.plugins');

// Supported config file patterns (in priority order)
const CONFIG_PATTERNS = [
    "simplens.config.yaml",
    "simplens.config.yml",
    "simplens.config.json"
];

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

/**
 * Remove provider entries and channel configs for the given package
 * @returns {object} Object with removedProviders and removedChannels counts
 */
function removeFromConfig(packageName) {
    const configFile = findConfigFile(CONFIG_PATTERNS);
    if (!configFile) {
        console.log('ℹ️  No config file found, skipping config cleanup');
        return { removedProviders: 0, removedChannels: 0 };
    }

    const config = parseConfigFile(configFile.path);
    if (!config) {
        return { removedProviders: 0, removedChannels: 0 };
    }

    // Find all provider IDs that will be removed
    const providerIdsToRemove = [];
    const originalProviderCount = config.providers?.length || 0;

    if (config.providers && Array.isArray(config.providers)) {
        // Collect IDs of providers to be removed
        for (const provider of config.providers) {
            if (provider.package === packageName) {
                providerIdsToRemove.push(provider.id);
            }
        }

        // Filter out providers with matching package
        config.providers = config.providers.filter(p => p.package !== packageName);
    }

    const removedProviders = originalProviderCount - (config.providers?.length || 0);

    // Remove channel entries that reference removed provider IDs
    let removedChannels = 0;
    if (config.channels && typeof config.channels === 'object') {
        const channelsToRemove = [];

        for (const [channelName, channelConfig] of Object.entries(config.channels)) {
            // Check if default or fallback matches any removed provider ID
            const defaultProvider = channelConfig.default;
            const fallbackProvider = channelConfig.fallback;

            if (providerIdsToRemove.includes(defaultProvider)) {
                // If fallback exists, promote it to default
                if (fallbackProvider && !providerIdsToRemove.includes(fallbackProvider)) {
                    config.channels[channelName] = { default: fallbackProvider };
                    console.log(`   ⚡ Promoted fallback to default for channel: ${channelName}`);
                } else {
                    // Remove the entire channel entry
                    channelsToRemove.push(channelName);
                }
            } else if (providerIdsToRemove.includes(fallbackProvider)) {
                // Just remove the fallback
                delete config.channels[channelName].fallback;
                console.log(`   🔧 Removed fallback for channel: ${channelName}`);
            }
        }

        // Remove channels that have no valid providers
        for (const channelName of channelsToRemove) {
            delete config.channels[channelName];
            removedChannels++;
        }
    }

    // Write updated config if changes were made
    if (removedProviders > 0 || removedChannels > 0) {
        writeConfigFile(configFile.path, config);
        console.log(`✅ Updated ${configFile.filename}`);
    }

    return { removedProviders, removedChannels, providerIds: providerIdsToRemove };
}

function uninstallPlugin(packageName) {
    if (!existsSync(PLUGINS_DIR)) {
        console.error('❌ No plugins directory found. Nothing to uninstall.');
        process.exit(1);
    }

    console.log(`\n🗑️  Uninstalling plugin: ${packageName}\n`);

    try {
        // First, remove from config
        console.log('📝 Cleaning up configuration...');
        const { removedProviders, removedChannels, providerIds } = removeFromConfig(packageName);

        if (removedProviders > 0) {
            console.log(`   Removed ${removedProviders} provider(s): ${providerIds.join(', ')}`);
        }
        if (removedChannels > 0) {
            console.log(`   Removed ${removedChannels} channel(s)`);
        }
        if (removedProviders === 0 && removedChannels === 0) {
            console.log('   No config entries found for this package');
        }

        // Then uninstall the npm package
        console.log('\n📦 Uninstalling npm package...');
        execSync(`npm uninstall ${packageName}`, {
            cwd: PLUGINS_DIR,
            stdio: 'inherit'
        });

        console.log(`\n✅ Successfully uninstalled ${packageName}\n`);
    } catch (error) {
        console.error(`\n❌ Failed to uninstall ${packageName}`);
        process.exit(1);
    }
}

// Main
const packageName = process.argv[2];
if (!packageName) {
    console.error('Usage: npm run plugin:uninstall <package-name>');
    console.error('Example: npm run plugin:uninstall @simplens/mock');
    process.exit(1);
}

uninstallPlugin(packageName);

