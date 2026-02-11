import { writeFile, appendFile, logInfo, logSuccess, logWarning } from './utils.js';
import { text, password } from '@clack/prompts';
import { handleCancel } from './ui.js';
import path from 'path';
import crypto from 'crypto';
import { CRITICAL_ENV_KEYS } from './config/constants.js';
import type { EnvVariable } from './types/domain.js';

export const DEFAULT_BASE_PATH = '';

/**
 * Generate a secure random string for credentials
 */
export function generateSecureRandom(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64').slice(0, length);
}

/**
 * Generate default value for a critical environment variable
 */
export function generateDefaultValue(key: string): string {
    if (key === 'NS_API_KEY') {
        return `sk_${generateSecureRandom(48)}`;
    }
    if (key === 'AUTH_SECRET') {
        return generateSecureRandom(64);
    }
    if (key === 'ADMIN_PASSWORD') {
        return `Admin${generateSecureRandom(16)}`;
    }
    return '';
}

/**
 * Validate BASE_PATH value.
 * Accepts:
 * - Empty value for root path
 * - Slash-prefixed lowercase segments (e.g. /dashboard, /admin/v1)
 */
export function validateBasePath(input: string): true | string {
    const value = input.trim();

    if (!value) {
        return true;
    }

    if (!value.startsWith('/')) {
        return 'Base path must start with / (example: /dashboard)';
    }

    if (value.endsWith('/')) {
        return 'Base path must not end with /';
    }

    if (!/^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(value)) {
        return 'Use lowercase letters, numbers, hyphens, and "/" separators only';
    }

    return true;
}

/**
 * Normalize BASE_PATH for consistent downstream use.
 */
export function normalizeBasePath(input: string): string {
    return input.trim();
}

/**
 * Prompt BASE_PATH once at the beginning of onboarding.
 */
export async function promptBasePath(defaultValue: string = DEFAULT_BASE_PATH): Promise<string> {
    const result = await text({
        message: 'BASE_PATH for dashboard (leave empty for root, example: /dashboard):',
        placeholder: defaultValue || 'leave empty for root',
        defaultValue,
        validate: (value: string | undefined) => {
            const v = validateBasePath(value ?? '');
            return v === true ? undefined : v;
        },
        withGuide: true,
    });

    handleCancel(result);
    return normalizeBasePath(result as string);
}

/**
 * Load and parse .env.example from embedded template
 */
export async function loadEnvExample(): Promise<EnvVariable[]> {
    // Embedded .env template - always available regardless of installation
    const envTemplate = `
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
BASE_PATH=
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
 * @param basePath - BASE_PATH value already collected
 * @param fullMode - If true, auto-generate critical values without prompting
 * @returns Map of environment variable keys to values
 */
export async function promptEnvVariables(
    mode: 'default' | 'interactive',
    infraServices: string[],
    basePath: string = DEFAULT_BASE_PATH,
    fullMode: boolean = false
): Promise<Map<string, string>> {
    logInfo('Configuring environment variables...');

    const envVars = await loadEnvExample();
    const result = new Map<string, string>();
    const normalizedBasePath = normalizeBasePath(basePath);
    const basePathLabel = normalizedBasePath || '(root)';
    logInfo(`BASE_PATH selected: ${basePathLabel}`);

    // Auto-fill infra connection URLs based on selected services using Docker service names
    const autoInfraUrls: Record<string, string> = {
        MONGO_URI: infraServices.includes('mongo') 
            ? `mongodb://mongo:27017/simplens?replicaSet=rs0`
            : '',
        BROKERS: infraServices.includes('kafka') 
            ? 'kafka:9093'
            : '',
        REDIS_URL: infraServices.includes('redis') 
            ? 'redis://redis:6379'
            : '',
        LOKI_URL: infraServices.includes('loki') 
            ? 'http://loki:3100'
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

            // BASE_PATH is collected upfront in onboarding flow
            if (envVar.key === 'BASE_PATH') {
                result.set(envVar.key, normalizedBasePath);
                continue;
            }

            // Use default value if available
            if (envVar.value && !CRITICAL_ENV_KEYS.includes(envVar.key)) {
                result.set(envVar.key, envVar.value);
                continue;
            }

            // Prompt for critical values (only if not auto-filled)
            if (CRITICAL_ENV_KEYS.includes(envVar.key)) {
                if (fullMode) {
                    // In full mode, auto-generate critical values
                    const defaultValue = generateDefaultValue(envVar.key);
                    if (defaultValue) {
                        result.set(envVar.key, defaultValue);
                    }
                } else {
                    const promptMessage = `${envVar.key}${envVar.description ? ` (${envVar.description})` : ''}:`;
                    const isPasswordField = envVar.key.includes('PASSWORD');

                    let answer: string | symbol;
                    if (isPasswordField) {
                        answer = await password({
                            message: promptMessage,
                            validate: (input: string | undefined) => {
                                if (!input && envVar.required) {
                                    return `${envVar.key} is required`;
                                }
                                return undefined;
                            },
                        });
                    } else {
                        answer = await text({
                            message: promptMessage,
                            placeholder: getSuggestedValue(envVar.key) || undefined,
                            defaultValue: getSuggestedValue(envVar.key) || undefined,
                            validate: (input: string | undefined) => {
                                if (!input && envVar.required) {
                                    return `${envVar.key} is required`;
                                }
                                return undefined;
                            },
                        });
                    }

                    handleCancel(answer);
                    result.set(envVar.key, answer as string);
                }
            }
        }
    } else {
        // Interactive mode: prompt for everything
        logInfo('Interactive mode: You will be prompted for each environment variable.');
        
        for (const envVar of envVars) {
            const defaultValue = autoInfraUrls[envVar.key] || envVar.value || getSuggestedValue(envVar.key);
            
            // BASE_PATH is collected upfront in onboarding flow
            if (envVar.key === 'BASE_PATH') {
                result.set(envVar.key, normalizedBasePath);
                continue;
            }
            
            const promptMessage = `${envVar.key}${envVar.description ? ` (${envVar.description})` : ''}:`;
            const isPasswordField = envVar.key.includes('PASSWORD');

            let answer: string | symbol;
            if (isPasswordField) {
                answer = await password({
                    message: promptMessage,
                    validate: (input: string | undefined) => {
                        if (!input && envVar.required) {
                            return `${envVar.key} is required`;
                        }
                        return undefined;
                    },
                });
            } else {
                answer = await text({
                    message: promptMessage,
                    placeholder: defaultValue || undefined,
                    defaultValue: defaultValue || undefined,
                    validate: (input: string | undefined) => {
                        if (!input && envVar.required) {
                            return `${envVar.key} is required`;
                        }
                        return undefined;
                    },
                });
            }

            handleCancel(answer);
            result.set(envVar.key, answer as string);
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
