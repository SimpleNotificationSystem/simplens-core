#!/usr/bin/env node
/**
 * SimpleNS Plugin Uninstaller
 * Usage: node scripts/plugin-uninstall.js <package-name>
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGINS_DIR = join(__dirname, '..', '.plugins');

function uninstallPlugin(packageName) {
    if (!existsSync(PLUGINS_DIR)) {
        console.error('❌ No plugins directory found. Nothing to uninstall.');
        process.exit(1);
    }

    console.log(`\n🗑️  Uninstalling plugin: ${packageName}\n`);

    try {
        execSync(`npm uninstall ${packageName}`, {
            cwd: PLUGINS_DIR,
            stdio: 'inherit'
        });

        console.log(`\n✅ Successfully uninstalled ${packageName}`);
        console.log(`\n📝 Remember to remove the provider entry from simplens.config.yaml\n`);
    } catch (error) {
        console.error(`\n❌ Failed to uninstall ${packageName}`);
        process.exit(1);
    }
}

// Main
const packageName = process.argv[2];
if (!packageName) {
    console.error('Usage: npm run plugin:uninstall <package-name>');
    process.exit(1);
}

uninstallPlugin(packageName);
