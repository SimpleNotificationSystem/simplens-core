#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import {
    displayBanner,
    logSuccess,
    logInfo,
    initLogger,
    logDebug,
    printStepHeader,
    printSummaryCard,
    printCommandHints,
} from './utils.js';
import { text, confirm, select, log, note } from '@clack/prompts';
import { intro, outro, handleCancel } from './ui.js';
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
    printStepHeader(step, total, title);
}

function shouldAutoEnableNginx(basePath: string): boolean {
    return normalizeBasePath(basePath) !== DEFAULT_BASE_PATH;
}

function showSetupSummary(setupOptions: OnboardSetupOptions, targetDir: string, autoNginx: boolean): void {
    const basePathLabel = setupOptions.basePath || '(root)';

    const summaryLines = [
        `Target directory   : ${targetDir}`,
        `Infrastructure     : ${setupOptions.infra ? 'enabled' : 'disabled'}`,
        `Environment mode   : ${setupOptions.envMode}`,
        `BASE_PATH          : ${basePathLabel}`,
        `Nginx auto-include : ${autoNginx ? 'enabled (BASE_PATH is non-default)' : 'disabled'}`,
    ].join('\n');

    note(summaryLines, 'Setup Summary');
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

    // --- BASE_PATH ---
    let basePathValue = cliBasePath;
    if (basePathValue === undefined) {
        basePathValue = await promptBasePath(DEFAULT_BASE_PATH);
    }

    // --- Infra flag ---
    let infraValue = options.infra;
    if (infraValue === undefined) {
        const result = await confirm({
            message: 'Do you want to setup infrastructure services (MongoDB, Kafka, Redis, etc.)?',
            initialValue: true,
            withGuide: true,
        });
        handleCancel(result);
        infraValue = result as boolean;
    }

    // --- Env mode ---
    let envModeValue = options.env;
    if (!envModeValue) {
        const result = await select({
            message: 'Select environment configuration mode:',
            options: [
                { value: 'default', label: 'Default', hint: 'use preset values, prompt only for critical' },
                { value: 'interactive', label: 'Interactive', hint: 'prompt for all variables' },
            ],
            initialValue: 'default',
            withGuide: true,
        });
        handleCancel(result);
        envModeValue = result as string;
    }

    // --- Target directory ---
    let targetDirValue = options.dir;
    if (!targetDirValue) {
        const result = await text({
            message: 'Target directory for setup:',
            defaultValue: process.cwd(),
            initialValue: process.cwd(),
            withGuide: true,
        });
        handleCancel(result);
        targetDirValue = result as string;
    }

    return {
        infra: infraValue,
        envMode: envModeValue || 'default',
        targetDir: targetDirValue || process.cwd(),
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

        // Clack intro
        intro('SimpleNS Onboard');

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

        logDebug(`Resolved target directory: ${targetDir}`);
        showSetupSummary(setupOptions, targetDir, autoEnableNginx);

        // Step 1: Validate prerequisites
        log.step('Step 1/6 — Prerequisites Validation');
        await validatePrerequisites();

        // Step 2: Infrastructure setup (if --infra flag is provided)
        log.step('Step 2/6 — Infrastructure Setup');
        let selectedInfraServices: string[] = [];

        if (setupOptions.infra) {
            if (!autoEnableNginx) {
                log.info('BASE_PATH is empty, nginx reverse proxy is disabled.');
                selectedInfraServices = await promptInfraServicesWithBasePath({ allowNginx: false });
            } else {
                selectedInfraServices = await promptInfraServicesWithBasePath({ allowNginx: true });
            }

            if (autoEnableNginx && !selectedInfraServices.includes('nginx')) {
                selectedInfraServices.push('nginx');
                log.info('BASE_PATH is non-default, so nginx was added automatically.');
            }

            await generateInfraCompose(targetDir, selectedInfraServices);
        } else {
            log.info('Skipping infrastructure setup (use --infra to enable).');
        }

        // Step 3: Always write app docker-compose
        log.step('Step 3/6 — Application Compose Setup');
        const includeNginxInAppCompose = autoEnableNginx && !selectedInfraServices.includes('nginx');
        if (includeNginxInAppCompose) {
            log.info('Including nginx in docker-compose.yaml because BASE_PATH is non-default.');
        }
        await writeAppCompose(targetDir, { includeNginx: includeNginxInAppCompose });

        // Step 4: Environment configuration
        log.step('Step 4/6 — Environment Configuration');
        const envMode = setupOptions.envMode;
        const envVars = await promptEnvVariables(envMode, selectedInfraServices, setupOptions.basePath);
        await generateEnvFile(targetDir, envVars);

        // Generate nginx.conf whenever nginx is active in either compose file
        const nginxEnabled = selectedInfraServices.includes('nginx') || includeNginxInAppCompose;
        if (nginxEnabled) {
            await generateNginxConfig(targetDir, setupOptions.basePath);
        }

        // Step 5: Plugin installation
        log.step('Step 5/6 — Plugin Installation');
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
        log.step('Step 6/6 — Service Orchestration');
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
            log.info('Services not started. You can start them later with:');
            const commands: string[] = [];
            if (setupOptions.infra) {
                commands.push('docker-compose -f docker-compose.infra.yaml up -d');
            }
            commands.push('docker-compose up -d');
            printCommandHints('Manual startup commands', commands);
        }

        // Final success message
        logSuccess('SimpleNS onboarding completed successfully.');

        // Display access information
        if (nginxEnabled) {
            if (setupOptions.basePath) {
                note(
                    `Dashboard : http://localhost${setupOptions.basePath}\nAPI       : http://localhost/api/notification/`,
                    'Service Access'
                );
            } else {
                note(
                    'Dashboard : http://localhost\nAPI       : http://localhost/api/notification/',
                    'Service Access'
                );
            }
        } else {
            note(
                'Dashboard : http://localhost:3002\nAPI       : http://localhost:3000',
                'Service Access'
            );
        }

        // Clack outro
        outro('Setup complete — happy notifying! 🚀');

    } catch (error: unknown) {
        // Import at top of file
        const { formatErrorForUser } = await import('./types/errors.js');

        console.log('\n' + formatErrorForUser(error as Error));

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
