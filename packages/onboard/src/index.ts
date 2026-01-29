#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import inquirer from 'inquirer';
import { displayBanner, logSuccess, logError, logInfo, initLogger, logDebug } from './utils.js';
import { validatePrerequisites } from './validators.js';
import {
    promptInfraServices,
    generateInfraCompose,
    writeAppCompose,
} from './infra.js';
import {
    promptEnvVariables,
    generateEnvFile,
    appendPluginEnv,
} from './env-config.js';
import {
    fetchAvailablePlugins,
    promptPluginSelection,
    generatePluginConfig,
    parseConfigCredentials,
    promptPluginCredentials,
} from './plugins.js';
import {
    promptStartServices,
    startInfraServices,
    waitForInfraHealth,
    startAppServices,
    displayServiceStatus,
} from './services.js';

const program = new Command();

program
    .name('@simplens/onboard')
    .description('A CLI tool to setup a SimpleNS instance on your machine/server')
    .version('1.0.0')
    .option('--infra', 'Setup infrastructure services (MongoDB, Kafka, Redis, etc.)')
    .option('--env <mode>', 'Environment setup mode: "default" or "interactive"')
    .option('--dir <path>', 'Target directory for setup')
    .parse(process.argv);

const options = program.opts();

/**
 * Prompt for setup options if not provided via CLI args
 */
async function promptSetupOptions(): Promise<{
    infra: boolean;
    envMode: 'default' | 'interactive';
    targetDir: string;
}> {
    const answers = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'infra',
            message: 'Do you want to setup infrastructure services (MongoDB, Kafka, Redis, etc.)?',
            default: true,
            when: () => options.infra === undefined,
        },
        {
            type: 'list',
            name: 'envMode',
            message: 'Select environment configuration mode:',
            choices: [
                { name: 'Default (use preset values, prompt only for critical)', value: 'default' },
                { name: 'Interactive (prompt for all variables)', value: 'interactive' },
            ],
            default: 'default',
            when: () => !options.env,
        },
        {
            type: 'input',
            name: 'targetDir',
            message: 'Target directory for setup:',
            default: process.cwd(),
            when: () => !options.dir,
        },
    ]);

    return {
        infra: options.infra !== undefined ? options.infra : answers.infra,
        envMode: options.env || answers.envMode || 'default',
        targetDir: options.dir || answers.targetDir || process.cwd(),
    };
}

/**
 * Main onboarding workflow
 */
async function main() {
    try {
        // Display banner
        displayBanner();

        // Initialize logger based on CLI flags
        const opts = program.opts();
        initLogger({
            verbose: opts.verbose || false,
            debug: opts.debug || false,
            logFile: opts.debug ? path.join(process.cwd(), 'onboard-debug.log') : undefined,
        });

        logDebug('Logger initialized');
        logDebug(`CLI options: ${JSON.stringify(opts)}`);

        // Prompt for setup options if not provided
        const setupOptions = await promptSetupOptions();
        
        // Get target directory
        const targetDir = path.resolve(setupOptions.targetDir);
        logInfo(`Target directory: ${targetDir}`);
        logDebug(`Resolved target directory: ${targetDir}`);

        // Step 1: Validate prerequisites
        await validatePrerequisites();

        // Step 2: Infrastructure setup (if --infra flag is provided)
        let selectedInfraServices: string[] = [];

        if (setupOptions.infra) {
            logInfo('\n🏗️  Infrastructure Setup\n');
            selectedInfraServices = await promptInfraServices();
            await generateInfraCompose(targetDir, selectedInfraServices);
        } else {
            logInfo('\n⏭️  Skipping infrastructure setup (use --infra to enable)');
        }

        // Always write app docker-compose
        logInfo('\n📦 Application Services Setup\n');
        await writeAppCompose(targetDir);

        // Step 3: Environment configuration
        logInfo('\n⚙️  Environment Configuration\n');
        const envMode = setupOptions.envMode;
        const envVars = await promptEnvVariables(envMode, selectedInfraServices);
        await generateEnvFile(targetDir, envVars);

        // Step 4: Plugin installation
        logInfo('\n🔌 Plugin Installation\n');
        const availablePlugins = await fetchAvailablePlugins();
        const selectedPlugins = await promptPluginSelection(availablePlugins);

        if (selectedPlugins.length > 0) {
            await generatePluginConfig(targetDir, selectedPlugins);

            // Extract and prompt for plugin credentials
            const configPath = path.join(targetDir, 'simplens.config.yaml');
            const credentialKeys = await parseConfigCredentials(configPath);
            
            if (credentialKeys.length > 0) {
                const pluginCreds = await promptPluginCredentials(credentialKeys);
                await appendPluginEnv(targetDir, pluginCreds);
            }
        }

        // Step 5: Service orchestration
        logInfo('\n🚀 Service Orchestration\n');
        const shouldStart = await promptStartServices();

        if (shouldStart) {
            // Start infra services first (if --infra was used)
            if (setupOptions.infra && selectedInfraServices.length > 0) {
                await startInfraServices(targetDir);
                await waitForInfraHealth(targetDir);
            }

            // Start app services
            await startAppServices(targetDir);

            // Display service status
            await displayServiceStatus();
        } else {
            logInfo('Services not started. You can start them later with:');
            if (setupOptions.infra) {
                console.log('  docker-compose -f docker-compose.infra.yaml up -d');
            }
            console.log('  docker-compose up -d\n');
        }

        // Final success message
        logSuccess('\n🎉 SimpleNS onboarding completed successfully!\n');

    } catch (error: any) {
        // Import at top of file
        const { formatErrorForUser } = await import('./types/errors.js');
        
        console.log('\n' + formatErrorForUser(error));
        
        // Log full error to stderr for debugging
        if (process.env.DEBUG) {
            console.error('\nFull error details:');
            console.error(error);
        }
        
        process.exit(1);
    }
}

// Run main function
main();
