import { execa } from 'execa';
import chalk from 'chalk';
import { logInfo, logWarning, divider, printSummaryCard, printCommandHints } from './utils.js';
import { confirm } from '@clack/prompts';
import { handleCancel, spinner } from './ui.js';
import { HEALTH_CHECK, getServiceURL } from './config/constants.js';

/**
 * Execute docker compose command with fallback to docker-compose.
 * Tries 'docker compose' first (newer), then falls back to 'docker-compose' (legacy).
 */
async function execDockerCompose(args: string[], cwd: string): Promise<void> {
    try {
        // Try newer 'docker compose' first
        await execa('docker', ['compose', ...args], { cwd });
    } catch (error: unknown) {
        if (!shouldFallbackToLegacyCompose(error)) {
            throw error;
        }
        // Fallback to legacy 'docker-compose'
        await execa('docker-compose', args, { cwd });
    }
}

function shouldFallbackToLegacyCompose(error: unknown): boolean {
    const execaError = error as {
        code?: string;
        stderr?: string;
        stdout?: string;
        shortMessage?: string;
        message?: string;
    };

    if (execaError?.code === 'ENOENT') {
        return true;
    }

    const output = [
        execaError?.stderr,
        execaError?.stdout,
        execaError?.shortMessage,
        execaError?.message,
    ]
        .filter(Boolean)
        .join('\n')
        .toLowerCase();

    return (
        output.includes("'compose' is not a docker command") ||
        output.includes('unknown command "compose" for "docker"')
    );
}

async function waitForContainerRunning(
    containerName: string,
    timeoutMs: number = 60_000,
    intervalMs: number = 1_500
): Promise<void> {
    const maxRetries = Math.ceil(timeoutMs / intervalMs);

    for (let i = 0; i < maxRetries; i++) {
        try {
            const { stdout } = await execa('docker', [
                'ps',
                '--filter',
                `name=^${containerName}$`,
                '--filter',
                'status=running',
                '--format',
                '{{.Names}}',
            ]);

            const running = stdout
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean)
                .includes(containerName);

            if (running) {
                return;
            }
        } catch {
            // continue polling
        }

        await sleep(intervalMs);
    }

    throw new Error(`Container '${containerName}' did not reach running state within ${timeoutMs}ms`);
}

type ComposeFile = 'docker-compose.yaml' | 'docker-compose.infra.yaml';

function withComposeFile(args: string[], composeFile?: ComposeFile): string[] {
    if (!composeFile) {
        return args;
    }
    return ['-f', composeFile, ...args];
}

/**
 * Prompts user whether to start the services immediately after setup.
 *
 * @returns `true` if user wants to start services, `false` otherwise
 */
export async function promptStartServices(): Promise<boolean> {
    const shouldStart = await confirm({
        message: 'Start services now after setup?',
        initialValue: true,
        withGuide: true,
    });

    handleCancel(shouldStart);
    return shouldStart as boolean;
}

/**
 * Starts infrastructure services using docker compose.
 * Runs `docker compose -f docker-compose.infra.yaml up -d` first,
 * then falls back to `docker-compose -f docker-compose.infra.yaml up -d`.
 *
 * @param targetDir - Directory containing docker-compose.infra.yaml
 * @throws Error if both docker compose and docker-compose commands fail
 */
export async function startInfraServices(targetDir: string): Promise<void> {
    logInfo('Starting infrastructure services...');

    const s = spinner();
    s.start('Starting docker-compose.infra.yaml...');

    try {
        await execDockerCompose(
            ['-f', 'docker-compose.infra.yaml', 'up', '-d'],
            targetDir
        );
        s.stop('Infrastructure services started');
    } catch (error: unknown) {
        s.error('Failed to start infrastructure services');
        throw error;
    }
}

/**
 * Waits for infrastructure services to become healthy.
 * Polls Docker health checks for up to 60 seconds (30 retries x 2s).
 *
 * @param targetDir - Directory where services are running
 */
export async function waitForInfraHealth(targetDir: string): Promise<void> {
    logInfo('Waiting for infrastructure services to be healthy...');

    const s = spinner();
    s.start('Checking service health...');

    // Wait for mongo, redis health checks
    const maxRetries = HEALTH_CHECK.MAX_RETRIES;
    const retryDelay = HEALTH_CHECK.RETRY_DELAY_MS;

    for (let i = 0; i < maxRetries; i++) {
        try {
            // Check if containers are healthy
            const { stdout } = await execa('docker', ['ps', '--filter', 'health=healthy', '--format', '{{.Names}}']);
            const healthyContainers = stdout.split('\n').filter(Boolean);

            // Check for critical services
            const hasMongoOrRedis = healthyContainers.some(name =>
                name.includes('mongo') || name.includes('redis')
            );

            if (hasMongoOrRedis) {
                s.stop('Infrastructure services are healthy');
                return;
            }

            s.message(`Waiting for services... (${i + 1}/${maxRetries})`);
            await sleep(retryDelay);
        } catch (error) {
            s.message(`Checking health... (${i + 1}/${maxRetries})`);
            await sleep(retryDelay);
        }
    }

    s.stop('Health check timed out, but services may still be starting');
    logWarning('You may need to wait a bit longer for all services to be ready.');
}

/**
 * Start application services
 */
export async function startAppServices(targetDir: string): Promise<void> {
    logInfo('Starting application services...');

    const s = spinner();
    s.start('Starting docker-compose.yaml...');

    try {
        await execDockerCompose(
            ['up', '-d'],
            targetDir
        );
        s.stop('Application services started');
    } catch (error: unknown) {
        s.error('Failed to start application services');
        throw error;
    }
}

export function getSslManualCommands(options: {
    composeFile: ComposeFile;
    domain: string;
    email: string;
}): string[] {
    const composeFlag = options.composeFile === 'docker-compose.infra.yaml'
        ? '-f docker-compose.infra.yaml '
        : '';

    return [
        `docker compose ${composeFlag}up -d nginx`,
        `docker compose ${composeFlag}run --rm --no-deps --entrypoint certbot certbot certonly --webroot -w /var/www/certbot --email ${options.email} --agree-tos --no-eff-email -d ${options.domain} --non-interactive`,
        `docker compose ${composeFlag}exec -T nginx nginx -s reload`,
        `docker compose ${composeFlag}up -d certbot-renew`,
    ];
}

/**
 * Returns detailed step-by-step manual SSL setup instructions.
 * Includes the nginx.conf swap from bootstrap → final (nginx.ssl.conf → nginx.conf).
 */
export function getSslDetailedInstructions(options: {
    composeFile: ComposeFile;
    domain: string;
    email: string;
    hasInfra: boolean;
}): { step: string; command?: string }[] {
    const composeFlag = options.composeFile === 'docker-compose.infra.yaml'
        ? '-f docker-compose.infra.yaml '
        : '';

    const steps: { step: string; command?: string }[] = [];

    if (options.hasInfra) {
        steps.push({
            step: 'Start infrastructure services (includes nginx with HTTP-only bootstrap config)',
            command: `docker compose ${composeFlag}up -d`,
        });
    }

    steps.push({
        step: 'Start application services',
        command: 'docker compose up -d',
    });

    if (!options.hasInfra) {
        steps.push({
            step: 'Ensure nginx is running for the ACME challenge',
            command: `docker compose ${composeFlag}up -d nginx`,
        });
    }

    steps.push({
        step: `Request SSL certificate from Let's Encrypt for ${options.domain}`,
        command: `docker compose ${composeFlag}run --rm --no-deps --entrypoint certbot certbot certonly --webroot -w /var/www/certbot --email ${options.email} --agree-tos --no-eff-email -d ${options.domain} --non-interactive`,
    });

    steps.push({
        step: 'Replace bootstrap nginx config with the SSL-enabled config (nginx.ssl.conf → nginx.conf)',
        command: process.platform === 'win32'
            ? 'copy /Y nginx.ssl.conf nginx.conf'
            : 'cp nginx.ssl.conf nginx.conf',
    });

    steps.push({
        step: 'Reload nginx to apply SSL configuration',
        command: `docker compose ${composeFlag}exec -T nginx nginx -s reload`,
    });

    steps.push({
        step: 'Start automatic certificate renewal service',
        command: `docker compose ${composeFlag}up -d certbot-renew`,
    });

    return steps;
}

export async function setupSslCertificates(targetDir: string, options: {
    composeFile: ComposeFile;
    domain: string;
    email: string;
}): Promise<void> {
    logInfo(`Setting up SSL certificate for ${options.domain}...`);

    const s = spinner();
    const composeArgs = (args: string[]) => withComposeFile(args, options.composeFile);

    s.start('Ensuring nginx service is running...');
    await execDockerCompose(composeArgs(['up', '-d', 'nginx']), targetDir);
    await waitForContainerRunning('nginx');
    s.stop('Nginx service is running');

    s.start('Requesting initial certificate from Let\'s Encrypt...');
    await execDockerCompose(
        composeArgs([
            'run',
            '--rm',
            '--no-deps',
            '--entrypoint',
            'certbot',
            'certbot',
            'certonly',
            '--webroot',
            '-w',
            '/var/www/certbot',
            '--email',
            options.email,
            '--agree-tos',
            '--no-eff-email',
            '-d',
            options.domain,
            '--non-interactive',
        ]),
        targetDir
    );
    s.stop('Initial certificate issued');

    s.start('Reloading nginx to apply certificates...');
    await execDockerCompose(composeArgs(['exec', '-T', 'nginx', 'nginx', '-s', 'reload']), targetDir);
    s.stop('Nginx reloaded');

    s.start('Starting automatic certificate renewal service...');
    await execDockerCompose(composeArgs(['up', '-d', 'certbot-renew']), targetDir);
    s.stop('Certificate auto-renewal service started');
}

export async function reloadNginxConfiguration(targetDir: string, options: {
    composeFile: ComposeFile;
}): Promise<void> {
    const composeArgs = (args: string[]) => withComposeFile(args, options.composeFile);
    await execDockerCompose(composeArgs(['exec', '-T', 'nginx', 'nginx', '-t']), targetDir);
    await execDockerCompose(composeArgs(['exec', '-T', 'nginx', 'nginx', '-s', 'reload']), targetDir);
}

/**
 * Display service status and URLs
 */
export async function displayServiceStatus(): Promise<void> {
    console.log(`\n${divider('green', '═')}`);
    console.log(chalk.greenBright(chalk.bold('Services Started')));
    console.log(divider('green', '═'));

    try {
        // Get running containers
        const { stdout } = await execa('docker', ['ps', '--format', '{{.Names}}']);
        const containers = stdout.split('\n').filter(Boolean).sort();

        const accessRows: Array<{ label: string; value: string }> = [];

        // Display URLs for known services
        if (containers.some(c => c.includes('api'))) {
            accessRows.push({ label: 'API Server', value: getServiceURL('API') });
            accessRows.push({ label: 'API Health', value: `${getServiceURL('API')}/health` });
        }

        if (containers.some(c => c.includes('dashboard'))) {
            accessRows.push({ label: 'Dashboard', value: getServiceURL('DASHBOARD') });
        }

        if (containers.some(c => c.includes('kafka-ui'))) {
            accessRows.push({ label: 'Kafka UI', value: getServiceURL('KAFKA_UI') });
        }

        if (containers.some(c => c.includes('grafana'))) {
            accessRows.push({ label: 'Grafana', value: `${getServiceURL('GRAFANA')} (admin/admin)` });
        }

        if (accessRows.length > 0) {
            printSummaryCard('Access URLs', accessRows);
        }

        console.log(chalk.cyanBright('Running Containers'));
        console.log(divider());
        for (const container of containers) {
            console.log(`  ${chalk.greenBright('•')} ${container}`);
        }
        console.log('');

        printCommandHints('Helpful commands', [
            'docker compose logs -f',
            'docker compose down',
        ]);
        console.log(`${divider('green', '═')}\n`);
    } catch (error) {
        logWarning('Could not fetch container status');
    }
}

/**
 * Helper: Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
