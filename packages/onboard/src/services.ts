import inquirer from 'inquirer';
import { execa } from 'execa';
import ora from 'ora';
import { logInfo, logSuccess, logError, logWarning } from './utils.js';
import chalk from 'chalk';
import { HEALTH_CHECK, SERVICE_PORTS, getServiceURL } from './config/constants.js';

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
 * Polls Docker health checks for up to 60 seconds (30 retries × 2s).
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
    console.log('\n' + chalk.green('═'.repeat(60)));
    console.log(chalk.green.bold('  ✅ Services Started Successfully!'));
    console.log(chalk.green('═'.repeat(60)) + '\n');

    try {
        // Get running containers
        const { stdout } = await execa('docker', ['ps', '--format', '{{.Names}}']);
        const containers = stdout.split('\n').filter(Boolean);

        console.log(chalk.cyan.bold('🔗 Access URLs:\n'));

        // Display URLs for known services
        if (containers.some(c => c.includes('api'))) {
            console.log(`  ${chalk.bold('API Server:')}      ${chalk.underline(getServiceURL('API'))}`);
            console.log(`  ${chalk.bold('API Health:')}     ${chalk.underline(getServiceURL('API') + '/health')}\n`);
        }

        if (containers.some(c => c.includes('dashboard'))) {
            console.log(`  ${chalk.bold('Dashboard:')}      ${chalk.underline(getServiceURL('DASHBOARD'))}\n`);
        }

        if (containers.some(c => c.includes('kafka-ui'))) {
            console.log(`  ${chalk.bold('Kafka UI:')}       ${chalk.underline(getServiceURL('KAFKA_UI'))}\n`);
        }

        if (containers.some(c => c.includes('grafana'))) {
            console.log(`  ${chalk.bold('Grafana:')}        ${chalk.underline(getServiceURL('GRAFANA'))}`);
            console.log(`  ${chalk.gray('(default login: admin/admin)')}\n`);
        }

        console.log(chalk.cyan.bold('📦 Running Containers:\n'));
        for (const container of containers) {
            console.log(`  ${chalk.green('✓')} ${container}`);
        }

        console.log('\n' + chalk.cyan('To view logs:') + ' docker-compose logs -f');
        console.log(chalk.cyan('To stop services:') + ' docker-compose down\n');
        console.log(chalk.green('═'.repeat(60)) + '\n');

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
