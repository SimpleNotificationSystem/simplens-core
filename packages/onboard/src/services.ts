import inquirer from 'inquirer';
import { execa } from 'execa';
import ora from 'ora';
import chalk from 'chalk';
import { logInfo, logWarning, divider, printSummaryCard, printCommandHints } from './utils.js';
import { HEALTH_CHECK, getServiceURL } from './config/constants.js';

/**
 * Prompts user whether to start the services immediately after setup.
 *
 * @returns `true` if user wants to start services, `false` otherwise
 *
 * @example
 * ```ts
 * if (await promptStartServices()) {
 *   await startInfraServices(targetDir);
 * }
 * ```
 */
export async function promptStartServices(): Promise<boolean> {
    const answer = await inquirer.prompt<{ start: boolean }>([
        {
            type: 'confirm',
            name: 'start',
            message: 'Start services now after setup?',
            default: true,
        },
    ]);

    return answer.start;
}

/**
 * Starts infrastructure services using docker-compose.
 * Runs `docker-compose -f docker-compose.infra.yaml up -d` in the target directory.
 *
 * @param targetDir - Directory containing docker-compose.infra.yaml
 * @throws Error if docker-compose command fails
 *
 * @example
 * ```ts
 * await startInfraServices('/opt/simplens');
 * ```
 */
export async function startInfraServices(targetDir: string): Promise<void> {
    logInfo('Starting infrastructure services...');

    const spinner = ora('Starting docker-compose.infra.yaml...').start();

    try {
        await execa(
            'docker-compose',
            ['-f', 'docker-compose.infra.yaml', 'up', '-d'],
            { cwd: targetDir }
        );
        spinner.succeed('Infrastructure services started');
    } catch (error: any) {
        spinner.fail('Failed to start infrastructure services');
        throw error;
    }
}

/**
 * Waits for infrastructure services to become healthy.
 * Polls Docker health checks for up to 60 seconds (30 retries x 2s).
 *
 * @param targetDir - Directory where services are running
 *
 * @remarks
 * Checks for healthy containers running MongoDB or Redis.
 * Configuration: 30 max retries, 2000ms delay between retries.
 *
 * @example
 * ```ts
 * await startInfraServices(targetDir);
 * await waitForInfraHealth(targetDir); // Wait for services to be ready
 * ```
 */
export async function waitForInfraHealth(targetDir: string): Promise<void> {
    logInfo('Waiting for infrastructure services to be healthy...');

    const spinner = ora('Checking service health...').start();

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
                spinner.succeed('Infrastructure services are healthy');
                return;
            }

            spinner.text = `Waiting for services... (${i + 1}/${maxRetries})`;
            await sleep(retryDelay);
        } catch (error) {
            spinner.text = `Checking health... (${i + 1}/${maxRetries})`;
            await sleep(retryDelay);
        }
    }

    spinner.warn('Health check timed out, but services may still be starting');
    logWarning('You may need to wait a bit longer for all services to be ready.');
}

/**
 * Start application services
 */
export async function startAppServices(targetDir: string): Promise<void> {
    logInfo('Starting application services...');

    const spinner = ora('Starting docker-compose.yaml...').start();

    try {
        await execa(
            'docker-compose',
            ['up', '-d'],
            { cwd: targetDir }
        );
        spinner.succeed('Application services started');
    } catch (error: any) {
        spinner.fail('Failed to start application services');
        throw error;
    }
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
            'docker-compose logs -f',
            'docker-compose down',
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
