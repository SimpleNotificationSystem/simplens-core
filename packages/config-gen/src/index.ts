#!/usr/bin/env node
/**
 * SimpleNS Config Generator CLI
 * 
 * Generates simplens.config.yaml from plugin manifests.
 * 
 * Usage:
 *   simplens-config generate @simplens/nodemailer-gmail
 *   simplens-config gen @simplens/mock @simplens/nodemailer-gmail -c existing.yaml
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { generateConfig } from './generator.js';

const OFFICIAL_PLUGINS_URL = 'https://simplens.vercel.app/plugins/official';
const COMMUNITY_PLUGINS_URL = 'https://simplens.vercel.app/plugins/community';

interface PluginInfo {
    name: string;
    package: string;
    description: string;
}

const program = new Command();

program
    .name('simplens-config')
    .description('Generate simplens.config.yaml from plugin manifests')
    .version('1.0.0');

program
    .command('generate')
    .alias('gen')
    .description('Generate or update config for specified plugins')
    .argument('<plugins...>', 'Plugin package names (e.g., @simplens/nodemailer-gmail)')
    .option('-c, --config <file>', 'Existing config file to modify (creates new if not exists)')
    .option('-o, --output <file>', 'Output file path (default: simplens.config.yaml)')
    .option('--stdout', 'Print to stdout instead of file')
    .action(async (plugins: string[], options) => {
        await generateConfig(plugins, {
            configPath: options.config,
            outputPath: options.output || options.config || 'simplens.config.yaml',
            stdout: options.stdout
        });
    });

program
    .command('list')
    .description('List available SimpleNS plugins')
    .option('--official', 'Show only official plugins')
    .option('--community', 'Show only community plugins')
    .action(async (options) => {
        const spinner = ora('Fetching plugin list...').start();

        try {
            const showOfficial = options.official || (!options.official && !options.community);
            const showCommunity = options.community || (!options.official && !options.community);

            // Fetch official plugins
            if (showOfficial) {
                try {
                    const response = await fetch(OFFICIAL_PLUGINS_URL);
                    if (response.ok) {
                        const plugins: PluginInfo[] = await response.json();
                        spinner.stop();
                        console.log(chalk.cyan('\n📦 Official Plugins:\n'));
                        for (const plugin of plugins) {
                            console.log(`  ${chalk.green(plugin.package.padEnd(30))} ${plugin.name}`);
                            console.log(`  ${' '.repeat(30)} ${chalk.gray(plugin.description)}\n`);
                        }
                    }
                } catch {
                    spinner.stop();
                    console.log(chalk.yellow('\n⚠️  Could not fetch official plugins (offline?)\n'));
                }
            }

            // Fetch community plugins
            if (showCommunity) {
                try {
                    const response = await fetch(COMMUNITY_PLUGINS_URL);
                    if (response.ok) {
                        const plugins: PluginInfo[] = await response.json();
                        if (plugins.length > 0) {
                            spinner.stop();
                            console.log(chalk.cyan('🌍 Community Plugins:\n'));
                            for (const plugin of plugins) {
                                console.log(`  ${chalk.green(plugin.package.padEnd(30))} ${plugin.name}`);
                                console.log(`  ${' '.repeat(30)} ${chalk.gray(plugin.description)}\n`);
                            }
                        } else {
                            spinner.stop();
                            console.log(chalk.gray('🌍 No community plugins available yet.\n'));
                        }
                    }
                } catch {
                    spinner.stop();
                    console.log(chalk.yellow('⚠️  Could not fetch community plugins (offline?)\n'));
                }
            }

            console.log(chalk.cyan('Usage:'));
            console.log('  npx @simplens/config-gen generate <package-name>');
            console.log('  npx @simplens/config-gen gen @simplens/mock -o my-config.yaml\n');

        } catch (error) {
            spinner.fail('Failed to fetch plugin list');
            console.error(chalk.red('Error:'), error);
        }
    });

program.parse();

