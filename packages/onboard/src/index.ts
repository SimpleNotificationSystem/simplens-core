#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import inquirer from 'inquirer';
import { displayBanner, logSuccess, logInfo, initLogger, logDebug } from './utils.js';
import { validatePrerequisites } from './validators.js';
import {
    promptInfraServicesWithBasePath,
    generateInfraCompose,
    writeAppCompose,
    generateNginxConfig,
} from './infra.js';
import {
    promptEnvVariables,
    generateEnvFile,
    appendPluginEnv,
    promptBasePath,
    normalizeBasePath,
    validateBasePath,
    DEFAULT_BASE_PATH,
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
    .option('--base-path <path>', 'Dashboard BASE_PATH (example: /dashboard, default: root)')
    .parse(process.argv);

const options = program.opts();

interface OnboardSetupOptions {
    infra: boolean;
    envMode: 'default' | 'interactive';
    targetDir: string;
    basePath: string;
}

function printStep(step: number, total: number, title: string): void {
    logInfo(`\n[${step}/${total}] ${title}\n`);
}

function shouldAutoEnableNginx(basePath: string): boolean {
    return normalizeBasePath(basePath) !== DEFAULT_BASE_PATH;
}

function showSetupSummary(setupOptions: OnboardSetupOptions, targetDir: string, autoNginx: boolean): void {
    const basePathLabel = setupOptions.basePath || '(root)';

    console.log('\nSetup Summary');
    console.log('-------------');
    console.log(`Target directory: ${targetDir}`);
    console.log(`Infrastructure setup: ${setupOptions.infra ? 'enabled' : 'disabled'}`);
    console.log(`Environment mode: ${setupOptions.envMode}`);
    console.log(`BASE_PATH: ${basePathLabel}`);
    console.log(`Nginx auto-inclusion: ${autoNginx ? 'enabled (BASE_PATH is non-default)' : 'disabled'}`);
    console.log('');
}

/**
 * Prompt for setup options if not provided via CLI args
 */
async function promptSetupOptions(): Promise<OnboardSetupOptions> {
    const cliBasePath = typeof options.basePath === 'string'
        ? normalizeBasePath(options.basePath)
        : undefined;

    if (cliBasePath !== undefined) {
        const validation = validateBasePath(cliBasePath);
        if (validation !== true) {
            throw new Error(`Invalid --base-path value: ${validation}`);
        }
    }

    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'basePath',
            message: 'BASE_PATH for dashboard (leave empty for root, example: /dashboard):',
            default: DEFAULT_BASE_PATH,
            when: () => cliBasePath === undefined,
            validate: validateBasePath,
        },
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

    let basePathValue = cliBasePath;
    if (basePathValue === undefined) {
        if (typeof answers.basePath === 'string') {
            basePathValue = normalizeBasePath(answers.basePath);
        } else {
            basePathValue = await promptBasePath(DEFAULT_BASE_PATH);
        }
    }

    return {
        infra: options.infra !== undefined ? options.infra : answers.infra,
        envMode: options.env || answers.envMode || 'default',
        targetDir: options.dir || answers.targetDir || process.cwd(),
        basePath: basePathValue,
    };
}

/**
 * Main onboarding workflow
 */
async function main() {
    try {
        const totalSteps = 6;

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
        const autoEnableNginx = shouldAutoEnableNginx(setupOptions.basePath);

        logInfo(`Target directory: ${targetDir}`);
        logDebug(`Resolved target directory: ${targetDir}`);
        showSetupSummary(setupOptions, targetDir, autoEnableNginx);

        // Step 1: Validate prerequisites
        printStep(1, totalSteps, 'Prerequisites Validation');
        await validatePrerequisites();

        // Step 2: Infrastructure setup (if --infra flag is provided)
        printStep(2, totalSteps, 'Infrastructure Setup');
        let selectedInfraServices: string[] = [];

        if (setupOptions.infra) {
            if (!autoEnableNginx) {
                logInfo('BASE_PATH is empty, nginx reverse proxy is disabled.');
                selectedInfraServices = await promptInfraServicesWithBasePath({ allowNginx: false });
            } else {
                selectedInfraServices = await promptInfraServicesWithBasePath({ allowNginx: true });
            }

            if (autoEnableNginx && !selectedInfraServices.includes('nginx')) {
                selectedInfraServices.push('nginx');
                logInfo('BASE_PATH is non-default, so nginx was added automatically.');
            }

            await generateInfraCompose(targetDir, selectedInfraServices);
        } else {
            logInfo('Skipping infrastructure setup (use --infra to enable).');
        }

        // Step 3: Always write app docker-compose
        printStep(3, totalSteps, 'Application Compose Setup');
        const includeNginxInAppCompose = autoEnableNginx && !selectedInfraServices.includes('nginx');
        if (includeNginxInAppCompose) {
            logInfo('Including nginx in docker-compose.yaml because BASE_PATH is non-default.');
        }
        await writeAppCompose(targetDir, { includeNginx: includeNginxInAppCompose });

        // Step 4: Environment configuration
        printStep(4, totalSteps, 'Environment Configuration');
        const envMode = setupOptions.envMode;
        const envVars = await promptEnvVariables(envMode, selectedInfraServices, setupOptions.basePath);
        await generateEnvFile(targetDir, envVars);

        // Generate nginx.conf whenever nginx is active in either compose file
        const nginxEnabled = selectedInfraServices.includes('nginx') || includeNginxInAppCompose;
        if (nginxEnabled) {
            await generateNginxConfig(targetDir, setupOptions.basePath);
        }

        // Step 5: Plugin installation
        printStep(5, totalSteps, 'Plugin Installation');
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

        // Step 6: Service orchestration
        printStep(6, totalSteps, 'Service Orchestration');
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
        logSuccess('\nSimpleNS onboarding completed successfully!\n');

        // Display access information
        if (nginxEnabled) {
            if (setupOptions.basePath) {
                logInfo(`\nDashboard Access: http://localhost${setupOptions.basePath}`);
                logInfo('API Access: http://localhost/api/notification/\n');
            } else {
                logInfo('\nDashboard Access: http://localhost');
                logInfo('API Access: http://localhost/api/notification/\n');
            }
        } else {
            logInfo('\nDashboard Access: http://localhost:3002');
            logInfo('API Access: http://localhost:3000\n');
        }

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
