#!/usr/bin/env node
/**
 * SimpleNS Plugin List
 * Lists all installed plugins
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGINS_DIR = join(__dirname, '..', '.plugins');
const PLUGINS_PACKAGE_JSON = join(PLUGINS_DIR, 'package.json');

function listPlugins() {
    if (!existsSync(PLUGINS_PACKAGE_JSON)) {
        console.log('\n📦 No plugins installed yet.');
        console.log('   Use: npm run plugin:install <package-name>\n');
        return;
    }

    const pkg = JSON.parse(readFileSync(PLUGINS_PACKAGE_JSON, 'utf-8'));
    const deps = Object.entries(pkg.dependencies || {});

    if (deps.length === 0) {
        console.log('\n📦 No plugins installed yet.');
        return;
    }

    console.log('\n📦 Installed plugins:\n');
    deps.forEach(([name, version]) => {
        console.log(`   • ${name}@${version}`);
    });
    console.log('');
}

listPlugins();
