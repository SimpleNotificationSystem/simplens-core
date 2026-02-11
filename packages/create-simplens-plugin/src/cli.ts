import { Command } from 'commander';
import { runInteractivePrompts, getDefaultConfig } from './prompts.js';
import { generatePlugin } from './generator.js';
import type { CliOptions } from './types.js';

/**
 * Create and configure the CLI program
 * @returns Configured Commander program
 */
export function createProgram(): Command {
    const program = new Command();

    program
        .name('create-simplens-plugin')
        .description('Scaffold a new SimpleNS notification plugin')
        .version('1.0.0')
        .option('-n, --name <name>', 'Plugin name (e.g., discord, telegram)')
        .option('-c, --channel <channel>', 'Channel identifier')
        .option('-d, --directory <dir>', 'Output directory')
        .option('-y, --yes', 'Use defaults, skip prompts')
        .option('--no-git', 'Skip git initialization')
        .option('--no-install', 'Skip npm install')
        .action(async (options: CliOptions) => {
            try {
                let config;

                if (options.yes) {
                    // Use defaults when --yes flag is provided
                    if (!options.name) {
                        console.error('Error: Plugin name is required when using --yes flag');
                        console.error('Usage: create-simplens-plugin --yes --name <plugin-name>');
                        process.exit(1);
                    }
                    config = getDefaultConfig(options);
                } else {
                    // Run interactive prompts
                    config = await runInteractivePrompts(options);
                }

                await generatePlugin(config);
            } catch (error) {
                if (error instanceof Error) {
                    console.error(`\nError: ${error.message}`);
                } else {
                    console.error('\nAn unexpected error occurred');
                }
                process.exit(1);
            }
        });

    return program;
}
