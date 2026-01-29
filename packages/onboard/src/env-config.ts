import inquirer from 'inquirer';
import { readFile, writeFile, appendFile, logInfo, logSuccess, logWarning } from './utils.js';
import path from 'path';
import { CRITICAL_ENV_KEYS, VALIDATION } from './config/constants.js';
import type { EnvVariable } from './types/domain.js';

/**
 * Load and parse .env.example from embedded template
 */
export async function loadEnvExample(): Promise<EnvVariable[]> {
    // Embedded .env template - always available regardless of installation
    const envTemplate = `
# ============================================
# INFRASTRUCTURE HOST CONFIGURATION
# ============================================
INFRA_HOST=host.docker.internal

# ============================================
# CONNECTION URLS
# ============================================
NODE_ENV=production
# ============================================
# API SERVER
# ============================================
NS_API_KEY=
PORT=3000
MAX_BATCH_REQ_LIMIT=1000

# ============================================
# DATABASE
# ============================================
MONGO_URI=

# ============================================
# KAFKA
# ============================================
BROKERS=

# Kafka Topic Partitions (Core Topics)
DELAYED_PARTITION=1
NOTIFICATION_STATUS_PARTITION=1

# ============================================
# REDIS
# ============================================
REDIS_URL=

# ============================================
# PLUGIN SYSTEM
# ============================================
SIMPLENS_CONFIG_PATH=./simplens.config.yaml
PROCESSOR_CHANNEL=all

# ============================================
# BACKGROUND WORKER
# ============================================
OUTBOX_POLL_INTERVAL_MS=5000
OUTBOX_CLEANUP_INTERVAL_MS=60000
OUTBOX_BATCH_SIZE=100
OUTBOX_RETENTION_MS=300000
OUTBOX_CLAIM_TIMEOUT_MS=30000

# ============================================
# RETRY & IDEMPOTENCY
# ============================================
IDEMPOTENCY_TTL_SECONDS=86400
MAX_RETRY_COUNT=5
PROCESSING_TTL_SECONDS=120

# ============================================
# DELAYED NOTIFICATIONS
# ============================================
DELAYED_POLL_INTERVAL_MS=1000
DELAYED_BATCH_SIZE=10
MAX_POLLER_RETRIES=3

# ============================================
# RECOVERY SERVICE
# ============================================
RECOVERY_POLL_INTERVAL_MS=60000
PROCESSING_STUCK_THRESHOLD_MS=300000
PENDING_STUCK_THRESHOLD_MS=300000
RECOVERY_BATCH_SIZE=50
RECOVERY_CLAIM_TIMEOUT_MS=60000

# ============================================
# CLEANUP
# ============================================
CLEANUP_RESOLVED_ALERTS_RETENTION_MS=86400000
CLEANUP_PROCESSED_STATUS_OUTBOX_RETENTION_MS=86400000

# ============================================
# LOGGING
# ============================================
LOKI_URL=
LOG_LEVEL=info
LOG_TO_FILE=true

# ============================================
# ADMIN DASHBOARD
# ============================================
AUTH_SECRET=
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
AUTH_TRUST_HOST=true
API_BASE_URL=http://api:3000
WEBHOOK_HOST=dashboard
WEBHOOK_PORT=3002
DASHBOARD_PORT=3002
`;

    return parseEnvContent(envTemplate);
}

/**
 * Parse .env content into structured format
 */
function parseEnvContent(content: string): EnvVariable[] {
    const lines = content.split('\n');
    const variables: EnvVariable[] = [];
    let currentComment = '';

    for (const line of lines) {
        const trimmed = line.trim();

        // Capture comments as descriptions
        if (trimmed.startsWith('#') && !trimmed.includes('====')) {
            currentComment = trimmed.replace(/^#\s*/, '');
            continue;
        }

        // Skip empty lines and section dividers
        if (!trimmed || trimmed.includes('====')) {
            currentComment = '';
            continue;
        }

        // Parse key=value pairs
        const match = trimmed.match(/^([A-Z_]+)=(.*)$/);
        if (match) {
            const [, key, value] = match;
            variables.push({
                key,
                value: value || '',
                description: currentComment || undefined,
                required: CRITICAL_ENV_KEYS.includes(key) || !value,
            });
            currentComment = '';
        }
    }

    return variables;
}

/**
 * Prompts user for environment variable values based on the selected mode.
 * 
 * @param mode - 'default' prompts only for critical vars, 'interactive' prompts for all
 * @param infraServices - List of selected infrastructure service IDs
 * @param infraHost - Host for infrastructure services
 * @returns Map of environment variable keys to values
 * 
 * @remarks
 * Critical variables (always prompted): NS_API_KEY, MONGO_URI, BROKERS, etc.
 * Interactive mode prompts for all variables including optional ones.
 * 
 * @example
 * ```ts
 * const envVars = await promptEnvVariables('default', ['mongo', 'kafka'], 'localhost');
 * // Prompts only for critical variables
 * ```
 */
export async function promptEnvVariables(
    mode: 'default' | 'interactive',
    infraServices: string[],
    infraHost: string
): Promise<Map<string, string>> {
    logInfo('Configuring environment variables...');

    const envVars = await loadEnvExample();
    const result = new Map<string, string>();

    // Auto-fill infra connection URLs based on selected services and host
    const autoInfraUrls: Record<string, string> = {
        MONGO_URI: infraServices.includes('mongo') 
            ? (infraHost==="host.docker.internal"?`mongodb://mongo:27017/simplens?replicaSet=rs0`:`mongodb://${infraHost}:27017/simplens?replicaSet=rs0`) 
            : '',
        BROKERS: infraServices.includes('kafka') 
            ? (infraHost==="host.docker.internal"?"kafka:9093":`${infraHost}:9092`) 
            : '',
        REDIS_URL: infraServices.includes('redis') 
            ? (infraHost==="host.docker.internal"?"redis://redis:6379":`redis://${infraHost}:6379`) 
            : '',
        LOKI_URL: infraServices.includes('loki') 
            ? (infraHost==="host.docker.internal"?"http://loki:3100":`http://${infraHost}:3100`) 
            : '',
    };

    if (mode === 'default') {
        // Use defaults, only prompt for critical values
        for (const envVar of envVars) {
            // Use auto-filled infra URLs
            if (autoInfraUrls[envVar.key]) {
                result.set(envVar.key, autoInfraUrls[envVar.key]);
                continue;
            }

            // Use default value if available
            if (envVar.value && !CRITICAL_ENV_KEYS.includes(envVar.key)) {
                result.set(envVar.key, envVar.value);
                continue;
            }

            // Prompt for critical values (only if not auto-filled)
            if (CRITICAL_ENV_KEYS.includes(envVar.key)) {
                const answer = await inquirer.prompt<{ value: string }>([
                    {
                        type: envVar.key.includes('PASSWORD') ? 'password' : 'input',
                        name: 'value',
                        message: `${envVar.key}${envVar.description ? ` (${envVar.description})` : ''}:`,
                        default: getSuggestedValue(envVar.key),
                        validate: (input: string) => {
                            if (!input && envVar.required) {
                                return `${envVar.key} is required`;
                            }
                            return true;
                        },
                    },
                ]);
                result.set(envVar.key, answer.value);
            }
        }
    } else {
        // Interactive mode: prompt for everything
        logInfo('Interactive mode: You will be prompted for each environment variable.');
        
        for (const envVar of envVars) {
            const defaultValue = autoInfraUrls[envVar.key] || envVar.value || getSuggestedValue(envVar.key);
            
            const answer = await inquirer.prompt<{ value: string }>([
                {
                    type: envVar.key.includes('PASSWORD') ? 'password' : 'input',
                    name: 'value',
                    message: `${envVar.key}${envVar.description ? ` (${envVar.description})` : ''}:`,
                    default: defaultValue,
                    validate: (input: string) => {
                        if (!input && envVar.required) {
                            return `${envVar.key} is required`;
                        }
                        return true;
                    },
                },
            ]);
            result.set(envVar.key, answer.value);
        }
    }

    logSuccess('Environment variables configured');
    return result;
}

/**
 * Get suggested value for specific keys
 */
function getSuggestedValue(key: string): string {
    if (key === 'NS_API_KEY' || key === 'AUTH_SECRET') {
        return `Replace with: openssl rand -base64 32`;
    }
    if (key === 'NODE_ENV') {
        return 'production';
    }
    if (key === 'ADMIN_USERNAME') {
        return 'admin';
    }
    return '';
}

/**
 * Generate .env file from variables
 */
export async function generateEnvFile(
    targetDir: string,
    envVars: Map<string, string>
): Promise<void> {
    const envPath = path.join(targetDir, '.env');
    
    let content = '# SimpleNS Environment Configuration\n';
    content += '# Generated by @simplens/onboard\n\n';

    for (const [key, value] of envVars.entries()) {
        content += `${key}=${value}\n`;
    }

    await writeFile(envPath, content);
    logSuccess('Generated .env file');
}

/**
 * Append plugin credentials to .env file
 */
export async function appendPluginEnv(
    targetDir: string,
    pluginEnvVars: Map<string, string>
): Promise<void> {
    // Only append if there are actually credentials to add
    if (pluginEnvVars.size === 0) {
        logInfo('No plugin credentials to add');
        return;
    }

    const envPath = path.join(targetDir, '.env');
    
    let content = '\n# Plugin Credentials\n';
    for (const [key, value] of pluginEnvVars.entries()) {
        content += `${key}=${value}\n`;
    }

    await appendFile(envPath, content);
    logSuccess('Added plugin credentials to .env');
}
