import { Command } from 'commander';
import { intro, outro } from './ui.js';
import { displayBanner, logError } from './utils.js';
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
                // Display banner
                displayBanner();

                let config;

                if (options.yes) {
                    // Use defaults when --yes flag is provided
                    if (!options.name) {
                        logError('Plugin name is required when using --yes flag');
                        logError('Usage: create-simplens-plugin --yes --name <plugin-name>');
                        process.exit(1);
                    }
                    config = getDefaultConfig(options);
                } else {
                    // Run interactive prompts
                    intro('Create a new SimpleNS notification plugin');
                    config = await runInteractivePrompts(options);
                }

                await generatePlugin(config);

                outro('All done! Your plugin is ready to use.');
            } catch (error) {
                if (error instanceof Error) {
                    logError(error.message);
                } else {
                    logError('An unexpected error occurred');
                }
                process.exit(1);
            }
        });

    return program;
}
