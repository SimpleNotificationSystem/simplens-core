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
    logWarning,
} from './utils.js';
import { text, confirm, select } from '@clack/prompts';
import { intro, outro, handleCancel, log, note } from './ui.js';
import {
    validatePrerequisites,
    validatePublicDomain,
    validateEmailAddress,
} from './validators.js';
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
    generateDefaultPluginCredentials,
} from './plugins.js';
import {
    promptStartServices,
    startInfraServices,
    waitForInfraHealth,
    startAppServices,
    displayServiceStatus,
    setupSslCertificates,
    getSslManualCommands,
} from './services.js';

const program = new Command();

program
    .name('@simplens/onboard')
    .description('A CLI tool to setup a SimpleNS instance on your machine/server')
    .version('1.0.0')
    .option('--full', 'Non-interactive mode - all options must be provided via CLI')
    .option('--infra [services...]', 'Infrastructure services (mongo, kafka, kafka-ui, redis, nginx, loki, grafana)')
    .option('--env <mode>', 'Environment setup mode: "default" or "interactive"')
    .option('--dir <path>', 'Target directory for setup')
    .option('--base-path <path>', 'Dashboard BASE_PATH (example: /dashboard, default: root)')
    .option('--core-version <version>', 'Override CORE_VERSION in generated .env (primarily for --full mode)')
    .option('--dashboard-version <version>', 'Override DASHBOARD_VERSION in generated .env (primarily for --full mode)')
    .option('--plugin [plugins...]', 'Plugins to install (e.g., @simplens/mock @simplens/nodemailer-gmail)')
    .option('--ssl', 'Enable optional SSL certificate setup using Dockerized Certbot')
    .option('--ssl-domain <domain>', 'Public domain for SSL certificate (required with --ssl in --full mode)')
    .option('--ssl-email <email>', 'Email for Let\'s Encrypt registration (required with --ssl in --full mode)')
    .option('--no-output', 'Suppress all console output (silent mode)');

interface OnboardSetupOptions {
    infra: boolean;
    infraServices: string[];
    envMode: 'default' | 'interactive';
    targetDir: string;
    basePath: string;
    plugins: string[];
    enableSsl: boolean;
    sslDomain?: string;
    sslEmail?: string;
}

function printStep(step: number, total: number, title: string): void {
    printStepHeader(step, total, title);
}

function shouldAutoEnableNginx(basePath: string): boolean {
    return normalizeBasePath(basePath) !== DEFAULT_BASE_PATH;
}

/**
 * Valid infrastructure services
 */
const VALID_INFRA_SERVICES = ['mongo', 'kafka', 'kafka-ui', 'redis', 'nginx', 'loki', 'grafana'];

/**
 * Validate infrastructure service names
 */
function validateInfraServices(services: string[]): { valid: boolean; invalid: string[] } {
    const invalid = services.filter(s => !VALID_INFRA_SERVICES.includes(s));
    return { valid: invalid.length === 0, invalid };
}

/**
 * Validate plugin names (must start with @simplens/ or be a valid npm package)
 */
function validatePlugins(plugins: string[]): { valid: boolean; invalid: string[] } {
    const invalid = plugins.filter(p => {
        // Must start with @ or be a valid npm package name
        return !p.match(/^(@[\w-]+\/[\w-]+|[\w-]+)$/);
    });
    return { valid: invalid.length === 0, invalid };
}

function showSetupSummary(setupOptions: OnboardSetupOptions, targetDir: string, autoNginx: boolean): void {
    const basePathLabel = setupOptions.basePath || '(root)';
    const infraLabel = setupOptions.infra 
        ? `enabled (${setupOptions.infraServices.join(', ')})` 
        : 'disabled';
    const pluginsLabel = setupOptions.plugins.length > 0 
        ? setupOptions.plugins.join(', ') 
        : 'none';
    const sslLabel = setupOptions.enableSsl
        ? `enabled (${setupOptions.sslDomain})`
        : 'disabled';

    const summaryLines = [
        `Target directory   : ${targetDir}`,
        `Infrastructure     : ${infraLabel}`,
        `Environment mode   : ${setupOptions.envMode}`,
        `BASE_PATH          : ${basePathLabel}`,
        `Plugins            : ${pluginsLabel}`,
        `SSL (Certbot)      : ${sslLabel}`,
        `Nginx auto-include : ${autoNginx ? 'enabled (BASE_PATH is non-default)' : 'disabled'}`,
    ].join('\n');

    note(summaryLines, 'Setup Summary');
}

/**
 * Prompt for setup options if not provided via CLI args
 * In --full mode, all required options must be provided via CLI
 */
async function promptSetupOptions(options: any): Promise<OnboardSetupOptions> {
    const isFullMode = options.full === true;

    // --- Validate --full mode requirements ---
    if (isFullMode) {
        const errors: string[] = [];

        // --env is required in full mode
        if (!options.env) {
            errors.push('--env <mode> is required in --full mode (use \"default\" or \"interactive\")');
        } else if (options.env !== 'default' && options.env !== 'interactive') {
            errors.push('--env must be either \"default\" or \"interactive\"');
        }

        // Validate --base-path if provided
        if (options.basePath) {
            const validation = validateBasePath(normalizeBasePath(options.basePath));
            if (validation !== true) {
                errors.push(`Invalid --base-path: ${validation}`);
            }
        }

        // Validate --infra services if provided
        if (options.infra && Array.isArray(options.infra)) {
            const { valid, invalid } = validateInfraServices(options.infra);
            if (!valid) {
                errors.push(
                    `Invalid infrastructure services: ${invalid.join(', ')}. ` +
                    `Valid options: ${VALID_INFRA_SERVICES.join(', ')}`
                );
            }
        }

        // Validate --plugin if provided
        if (options.plugin && Array.isArray(options.plugin)) {
            const { valid, invalid } = validatePlugins(options.plugin);
            if (!valid) {
                errors.push(`Invalid plugin names: ${invalid.join(', ')}`);
            }
        }

        if (options.ssl === true) {
            if (!options.sslDomain) {
                errors.push('--ssl-domain <domain> is required in --full mode when --ssl is enabled');
            } else {
                const domainValidation = validatePublicDomain(options.sslDomain);
                if (domainValidation !== true) {
                    errors.push(`Invalid --ssl-domain: ${domainValidation}`);
                }
            }

            if (!options.sslEmail) {
                errors.push('--ssl-email <email> is required in --full mode when --ssl is enabled');
            } else {
                const emailValidation = validateEmailAddress(options.sslEmail);
                if (emailValidation !== true) {
                    errors.push(`Invalid --ssl-email: ${emailValidation}`);
                }
            }
        }

        if (errors.length > 0) {
            console.error('\\n❌ Validation errors in --full mode:\\n');
            errors.forEach(err => console.error(`  • ${err}`));
            console.error('\\nRun with --help to see usage examples.\\n');
            process.exit(1);
        }
    }

    // --- BASE_PATH ---
    let basePathValue: string;
    const cliBasePath = typeof options.basePath === 'string'
        ? normalizeBasePath(options.basePath)
        : undefined;

    if (cliBasePath !== undefined) {
        const validation = validateBasePath(cliBasePath);
        if (validation !== true) {
            throw new Error(`Invalid --base-path value: ${validation}`);
        }
        basePathValue = cliBasePath;
    } else if (isFullMode) {
        basePathValue = DEFAULT_BASE_PATH; // Default to root in full mode
    } else {
        basePathValue = await promptBasePath(DEFAULT_BASE_PATH);
    }

    // --- Infra flag and services ---
    let infraValue: boolean;
    let infraServices: string[] = [];

    if (Array.isArray(options.infra) && options.infra.length > 0) {
        // --infra with services provided
        infraValue = true;
        infraServices = options.infra;
    } else if (options.infra === true) {
        // --infra flag without services (backward compatibility - prompt for services)
        infraValue = true;
        if (isFullMode) {
            // In full mode, empty --infra means no services selected (error)
            console.error('\\n❌ In --full mode, --infra requires service names.\\n');
            console.error('Example: --infra mongo kafka redis\\n');
            process.exit(1);
        }
        // Not in full mode, will prompt later
    } else {
        // No --infra flag provided
        if (isFullMode) {
            infraValue = false; // Default to no infrastructure in full mode
        } else {
            const result = await confirm({
                message: 'Do you want to setup infrastructure services (MongoDB, Kafka, Redis, etc.)?',
                initialValue: true,
                withGuide: true,
            });
            handleCancel(result);
            infraValue = result as boolean;
        }
    }

    // --- Env mode ---
    let envModeValue: 'default' | 'interactive';
    if (options.env) {
        envModeValue = options.env;
    } else if (isFullMode) {
        // Already validated above, this shouldn't happen
        envModeValue = 'default';
    } else {
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
        envModeValue = result as 'default' | 'interactive';
    }

    // --- Target directory ---
    let targetDirValue: string;
    if (options.dir) {
        targetDirValue = options.dir;
    } else if (isFullMode) {
        targetDirValue = process.cwd(); // Default to current directory in full mode
    } else {
        const result = await text({
            message: 'Target directory for setup:',
            defaultValue: process.cwd(),
            initialValue: process.cwd(),
            withGuide: true,
        });
        handleCancel(result);
        targetDirValue = result as string;
    }

    // --- Plugins ---
    let pluginsValue: string[] = [];
    if (Array.isArray(options.plugin) && options.plugin.length > 0) {
        pluginsValue = options.plugin;
    }
    // If not provided and not in full mode, will prompt later in the main workflow

    // --- SSL ---
    let enableSslValue = false;
    let sslDomainValue: string | undefined;
    let sslEmailValue: string | undefined;

    if (options.ssl === true) {
        enableSslValue = true;
    } else if (!isFullMode) {
        const sslConfirm = await confirm({
            message: 'Do you want to automatically setup SSL certificate using Certbot?',
            initialValue: false,
            withGuide: true,
        });
        handleCancel(sslConfirm);
        enableSslValue = sslConfirm as boolean;
    }

    if (enableSslValue) {
        if (typeof options.sslDomain === 'string') {
            sslDomainValue = options.sslDomain.trim().toLowerCase();
        } else if (!isFullMode) {
            const domainAnswer = await text({
                message: 'Public domain to secure (example: app.example.com):',
                validate: (value: string | undefined) => {
                    const validation = validatePublicDomain(value ?? '');
                    return validation === true ? undefined : validation;
                },
                withGuide: true,
            });
            handleCancel(domainAnswer);
            sslDomainValue = (domainAnswer as string).trim().toLowerCase();
        }

        if (typeof options.sslEmail === 'string') {
            sslEmailValue = options.sslEmail.trim();
        } else if (!isFullMode) {
            const emailAnswer = await text({
                message: 'Email for Let\'s Encrypt registration:',
                validate: (value: string | undefined) => {
                    const validation = validateEmailAddress(value ?? '');
                    return validation === true ? undefined : validation;
                },
                withGuide: true,
            });
            handleCancel(emailAnswer);
            sslEmailValue = (emailAnswer as string).trim();
        }
    }

    return {
        infra: infraValue,
        infraServices: infraServices,
        envMode: envModeValue || 'default',
        targetDir: targetDirValue || process.cwd(),
        basePath: basePathValue,
        plugins: pluginsValue,
        enableSsl: enableSslValue,
        sslDomain: sslDomainValue,
        sslEmail: sslEmailValue,
    };
}

/**
 * Main onboarding workflow
 */
async function main() {
    try {
        const totalSteps = 6;

        // Parse command line arguments FIRST
        program.parse(process.argv);
        const options = program.opts();

        // Initialize logger based on CLI flags (before any output)
        initLogger({
            verbose: options.verbose || false,
            debug: options.debug || false,
            silent: !options.output, // --no-output sets options.output to false
            logFile: options.debug ? path.join(process.cwd(), 'onboard-debug.log') : undefined,
        });

        // Display banner (after logger is initialized)
        displayBanner();

        // Clack intro
        intro('SimpleNS Onboard');

        logDebug('Logger initialized');
        logDebug(`CLI options: ${JSON.stringify(options)}`);

        // Prompt for setup options if not provided
        const setupOptions = await promptSetupOptions(options);

        // Get target directory
        const targetDir = path.resolve(setupOptions.targetDir);
        const autoEnableNginx = shouldAutoEnableNginx(setupOptions.basePath);
        const nginxRequired = autoEnableNginx || setupOptions.enableSsl;

        logDebug(`Resolved target directory: ${targetDir}`);
        showSetupSummary(setupOptions, targetDir, autoEnableNginx);

        // Step 1: Validate prerequisites
        log.step('Step 1/6 — Prerequisites Validation');
        await validatePrerequisites();

        // Step 2: Infrastructure setup (if --infra flag is provided)
        log.step('Step 2/6 — Infrastructure Setup');
        let selectedInfraServices: string[] = [];
        const shouldSetupInfra = setupOptions.infra || nginxRequired;

        if (shouldSetupInfra) {
            // Use pre-provided services from CLI, or prompt for them
            if (setupOptions.infra && setupOptions.infraServices.length > 0) {
                selectedInfraServices = setupOptions.infraServices;
                log.info(`Using infrastructure services: ${selectedInfraServices.join(', ')}`);
            } else if (!setupOptions.infra && nginxRequired) {
                selectedInfraServices = ['nginx'];
                log.info('Nginx is required (BASE_PATH/SSL), so infrastructure compose will be generated with nginx.');
            } else {
                // Prompt for services (interactive mode)
                if (!autoEnableNginx) {
                    log.info('BASE_PATH is empty, nginx reverse proxy is disabled.');
                    selectedInfraServices = await promptInfraServicesWithBasePath({
                        allowNginx: false,
                    });
                } else {
                    selectedInfraServices = await promptInfraServicesWithBasePath({
                        allowNginx: true,
                        defaultNginx: true,
                    });
                }
            }

            if (setupOptions.enableSsl && !selectedInfraServices.includes('nginx')) {
                selectedInfraServices.push('nginx');
                log.info('SSL is enabled, so nginx was added automatically.');
            }

            const infraHasNginx = selectedInfraServices.includes('nginx');
            await generateInfraCompose(targetDir, selectedInfraServices, {
                includeSsl: setupOptions.enableSsl && infraHasNginx,
            });
        } else {
            log.info('Skipping infrastructure setup (use --infra to enable).');
        }

        // Step 3: Always write app docker-compose
        log.step('Step 3/6 — Application Compose Setup');
        await writeAppCompose(targetDir, {
            includeNginx: false,
            includeSsl: false,
        });

        // Step 4: Environment configuration
        log.step('Step 4/6 — Environment Configuration');
        const envMode = setupOptions.envMode;
        const envOverrides = options.full
            ? {
                CORE_VERSION: options.coreVersion,
                DASHBOARD_VERSION: options.dashboardVersion,
            }
            : undefined;
        const envVars = await promptEnvVariables(
            envMode,
            selectedInfraServices,
            setupOptions.basePath,
            options.full || false,
            envOverrides
        );
        await generateEnvFile(targetDir, envVars);

        // In full mode, notify user about auto-generated credentials
        if (options.full) {
            logWarning(
                '⚠️  Auto-generated credentials in .env file. ' +
                'Please update NS_API_KEY, AUTH_SECRET, and ADMIN_PASSWORD before deploying to production!'
            );
        }

        // Generate nginx.conf whenever nginx is active in either compose file
        const nginxEnabled = selectedInfraServices.includes('nginx');
        if (nginxEnabled) {
            await generateNginxConfig(targetDir, setupOptions.basePath, {
                enableSsl: setupOptions.enableSsl,
                domain: setupOptions.sslDomain,
            });
        }

        // Step 5: Plugin installation
        log.step('Step 5/6 — Plugin Installation');
        let selectedPlugins: string[] = [];
        let pluginCredentialKeys: string[] = [];

        // Use pre-provided plugins from CLI, or prompt for them
        if (setupOptions.plugins.length > 0) {
            selectedPlugins = setupOptions.plugins;
            log.info(`Using plugins: ${selectedPlugins.join(', ')}`);
        } else if (!options.full) {
            // Only prompt in interactive mode
            const availablePlugins = await fetchAvailablePlugins();
            selectedPlugins = await promptPluginSelection(availablePlugins);
        }

        if (selectedPlugins.length > 0) {
            await generatePluginConfig(targetDir, selectedPlugins);

            // Extract and prompt for plugin credentials
            const configPath = path.join(targetDir, 'simplens.config.yaml');
            const credentialKeys = await parseConfigCredentials(configPath);
            pluginCredentialKeys = credentialKeys; // Store for later use

            if (credentialKeys.length > 0) {
                if (options.full) {
                    // In full mode, auto-generate placeholder credentials
                    const pluginCreds = generateDefaultPluginCredentials(credentialKeys);
                    await appendPluginEnv(targetDir, pluginCreds);
                    logWarning(
                        `⚠️  Auto-generated placeholder plugin credentials. ` +
                        `Please update these in .env file: ${credentialKeys.join(', ')}`
                    );
                } else {
                    const pluginCreds = await promptPluginCredentials(credentialKeys);
                    await appendPluginEnv(targetDir, pluginCreds);
                }
            }
        }

        // Step 6: Service orchestration
        log.step('Step 6/6 — Service Orchestration');
        
        let shouldStart = false;
        if (options.full) {
            // In full mode, don't auto-start services, just show commands
            log.info('In --full mode, services are not auto-started.');
        } else {
            shouldStart = await promptStartServices();
        }

        if (shouldStart) {
            // Start infra services first (if --infra was used)
            if (selectedInfraServices.length > 0) {
                await startInfraServices(targetDir);
                await waitForInfraHealth(targetDir);
            }

            // Start app services
            await startAppServices(targetDir);

            if (setupOptions.enableSsl && setupOptions.sslDomain && setupOptions.sslEmail) {
                await setupSslCertificates(targetDir, {
                    composeFile: 'docker-compose.infra.yaml',
                    domain: setupOptions.sslDomain,
                    email: setupOptions.sslEmail,
                });
            }

            // Display service status
            await displayServiceStatus();
        } else {
            log.info('Services not started. You can start them later with:');
            const commands: string[] = [];
            if (selectedInfraServices.length > 0) {
                commands.push('docker-compose -f docker-compose.infra.yaml up -d');
            }
            commands.push('docker-compose up -d');
            if (setupOptions.enableSsl && setupOptions.sslDomain && setupOptions.sslEmail) {
                commands.push(...getSslManualCommands({
                    composeFile: 'docker-compose.infra.yaml',
                    domain: setupOptions.sslDomain,
                    email: setupOptions.sslEmail,
                }));
            }
            printCommandHints('Manual startup commands', commands);
        }

        // Final success message
        logSuccess('SimpleNS onboarding completed successfully.');

        // In full mode, show a comprehensive security warning
        if (options.full) {
            const credentialWarnings = [
                '  • NS_API_KEY - API authentication key',
                '  • AUTH_SECRET - Session secret for dashboard',
                '  • ADMIN_PASSWORD - Dashboard admin password',
            ];

            if (pluginCredentialKeys.length > 0) {
                credentialWarnings.push(`  • Plugin credentials: ${pluginCredentialKeys.join(', ')}`);
            }

            note(
                '⚠️  IMPORTANT: Auto-generated credentials were used for non-interactive setup.\n' +
                '\n' +
                'Please update the following in your .env file before production use:\n' +
                credentialWarnings.join('\n') +
                '\n\n' +
                'Default credentials are NOT secure for production environments.',
                'Security Notice'
            );
        }

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
        const { getLoggerConfig } = await import('./utils/logger.js');

        // Always log errors to stderr, even in silent mode
        if (!getLoggerConfig().silent) {
            console.log('\n' + formatErrorForUser(error as Error));
        } else {
            // In silent mode, write to stderr
            console.error(formatErrorForUser(error as Error));
        }

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
