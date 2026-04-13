/**
 * Config Generator
 * 
 * Core logic for generating simplens.config.yaml from plugin manifests.
 */

import { mkdtemp, rm, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import { extractManifest, ProviderManifest } from './manifest.js'
import { generateProviderEntry } from './templates.js';
import { serializeConfigWithComments, parseExistingConfig, SimpleNSConfig } from './yaml-utils.js';

interface GenerateOptions {
    configPath?: string;   // Existing config to modify
    outputPath: string;    // Where to write output
    stdout?: boolean;      // Print to stdout instead
}

interface PluginInfo {
    packageName: string;
    manifest: ProviderManifest;
    providerId: string;
}

const NPM_PACKAGE_SPEC_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?:@[a-z0-9][a-z0-9._-]*)?$/i;

function assertValidPackageSpecs(packages: string[]): void {
    for (const pkg of packages) {
        if (!NPM_PACKAGE_SPEC_PATTERN.test(pkg)) {
            throw new Error(`Invalid package spec: ${pkg}`);
        }
    }
}

export async function generateConfig(packages: string[], options: GenerateOptions): Promise<void> {
    const spinner = ora('Creating temporary directory...').start();
    const tempDir = await mkdtemp(join(tmpdir(), 'simplens-config-'));

    try {
        // Step 1: Load existing config if provided
        let existingConfig: SimpleNSConfig | null = null;
        if (options.configPath && existsSync(options.configPath)) {
            spinner.text = 'Loading existing config...';
            existingConfig = await parseExistingConfig(options.configPath);
            spinner.succeed(`Loaded existing config from ${options.configPath}`);
        }

        // Step 2: Initialize temp npm project
        spinner.start('Initializing npm project...');
        execFileSync('npm', ['init', '-y'], { cwd: tempDir, stdio: 'pipe' });

        // Step 3: Install all plugins
        spinner.text = `Installing ${packages.length} plugin(s)...`;
        try {
            assertValidPackageSpecs(packages);
            execFileSync('npm', ['install', ...packages], { cwd: tempDir, stdio: 'pipe' });
        } catch (err) {
            spinner.fail('Failed to install plugins');
            console.error(chalk.red('\nError: Could not install one or more plugins.'));
            console.error(chalk.yellow('Make sure the package names are correct and published to npm.'));
            process.exit(1);
        }
        spinner.succeed('Plugins installed');

        // Step 4: Extract manifests and organize by channel
        spinner.start('Reading plugin manifests...');
        const pluginsByChannel = new Map<string, PluginInfo[]>();

        for (const pkg of packages) {
            try {
                const manifest = await extractManifest(tempDir, pkg);
                const providerId = pkg.replace(/^@simplens\//, '');

                const info: PluginInfo = { packageName: pkg, manifest, providerId };

                if (!pluginsByChannel.has(manifest.channel)) {
                    pluginsByChannel.set(manifest.channel, []);
                }
                pluginsByChannel.get(manifest.channel)!.push(info);
            } catch (err) {
                spinner.fail(`Failed to extract manifest from ${pkg}`);
                throw err;
            }
        }
        spinner.succeed('Manifests extracted');

        // Step 5: Build config structure
        const providers = existingConfig?.providers || [];
        const channels = existingConfig?.channels || {};
        const existingPackages = new Set(providers.map(p => p.package));

        for (const [channel, pluginInfos] of pluginsByChannel) {
            for (let i = 0; i < pluginInfos.length; i++) {
                const { packageName, manifest, providerId } = pluginInfos[i];

                // Skip if already in config
                if (existingPackages.has(packageName)) {
                    console.log(chalk.yellow(`  ⏭️  Skipping ${packageName} (already in config)`));
                    continue;
                }

                // Add provider entry
                providers.push(generateProviderEntry(packageName, providerId, manifest));

                // Configure channel: first plugin = default, second = fallback
                if (!channels[channel]) {
                    channels[channel] = { default: providerId };
                } else if (i === 1 && !channels[channel].fallback) {
                    channels[channel].fallback = providerId;
                }
            }
        }

        const config: SimpleNSConfig = { providers, channels };

        // Step 6: Serialize with comments
        const yaml = serializeConfigWithComments(config);

        // Step 7: Output
        if (options.stdout) {
            console.log(yaml);
        } else {
            await writeFile(options.outputPath, yaml);
            console.log(chalk.green(`\n✅ Config written to ${options.outputPath}`));
        }

        // Show summary
        if (!options.stdout) {
            console.log(chalk.cyan('\n📋 Summary:'));
            console.log(`   Providers: ${providers.length}`);
            console.log(`   Channels: ${Object.keys(channels).join(', ')}`);
            console.log(chalk.cyan('\n📝 Next steps:'));
            console.log('   1. Set environment variables for credentials');
            console.log('   2. Review channel default/fallback settings');
            console.log('   3. Adjust rate limits and priorities as needed\n');
        }

    } finally {
        // Cleanup temp directory
        await rm(tempDir, { recursive: true, force: true });
    }
}
