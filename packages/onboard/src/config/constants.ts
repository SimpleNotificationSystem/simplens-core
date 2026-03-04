/**
 * Application configuration constants
 */

/**
 * Service port mappings
 */
export const SERVICE_PORTS = {
    API: 3000,
    DASHBOARD: 3002,
    GRAFANA: 3001,
    KAFKA_UI: 8080,
    MONGO: 27017,
    KAFKA: 9092,
    REDIS: 6379,
    LOKI: 3100,
} as const;

/**
 * Health check configuration
 */
export const HEALTH_CHECK = {
    MAX_RETRIES: 30,
    RETRY_DELAY_MS: 2000,
    TIMEOUT_MS: 60000,
} as const;

/**
 * Docker command timeouts
 */
export const DOCKER_TIMEOUTS = {
    START_MS: 30000,
    STOP_MS: 15000,
    BUILD_MS: 300000,
} as const;

/**
 * Critical environment variables that always need user input
 */
export const CRITICAL_ENV_KEYS = [
    'NS_API_KEY',
    'MONGO_URI',
    'BROKERS',
    'REDIS_URL',
    'AUTH_SECRET',
    'ADMIN_PASSWORD',
    'CORE_VERSION',
    'DASHBOARD_VERSION',
];

/**
 * Validation constraints
 */
export const VALIDATION = {
    MIN_PASSWORD_LENGTH: 8,
    MIN_API_KEY_LENGTH: 8,
    PORT_MIN: 1,
    PORT_MAX: 65535,
} as const;

/**
 * File paths
 */
export const FILES = {
    DOCKER_COMPOSE_INFRA: 'docker-compose.infra.yaml',
    DOCKER_COMPOSE_APP: 'docker-compose.yaml',
    ENV_FILE: '.env',
    CONFIG_FILE: 'simplens.config.yaml',
    ERROR_LOG: 'onboard-error.log',
} as const;

/**
 * URL templates for service access
 */
export function getServiceURL(service: keyof typeof SERVICE_PORTS, host: string = 'localhost'): string {
    return `http://${host}:${SERVICE_PORTS[service]}`;
}

/**
 * Docker compose file paths
 */
export const DOCKER_COMPOSE_COMMANDS = {
    UP: ['up', '-d'],
    DOWN: ['down'],
    LOGS: ['logs', '-f'],
    PS: ['ps'],
} as const;
