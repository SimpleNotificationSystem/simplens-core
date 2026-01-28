/**
 * Domain type definitions for the onboarding system
 */

/**
 * Plugin information returned by config-gen
 */
export interface PluginInfo {
    /** Package name (e.g., '@simplens/nodemailer-gmail') */
    package: string;
    /** Display name */
    name: string;
    /** Description of what the plugin does */
    description: string;
}

/**
 * Infrastructure service option
 */
export interface InfraService {
    /** Display name (e.g., 'MongoDB (Database)') */
    name: string;
    /** Service identifier (e.g., 'mongo') */
    value: string;
    /** Whether checked by default */
    checked: boolean;
}

/**
 * Environment variable definition
 */
export interface EnvVariable {
    /** Environment variable key */
    key: string;
    /** Current or default value */
    value: string;
    /** Optional description/comment */
    description?: string;
    /** Whether this variable is required */
    required: boolean;
}

/**
 * Setup options provided via CLI or prompts
 */
export interface SetupOptions {
    /** Whether to setup infrastructure services */
    infra: boolean;
    /** Environment configuration mode */
    envMode: 'default' | 'interactive';
    /** Target directory for setup */
    targetDir: string;
}

/**
 * Service definition for docker-compose generation
 */
export interface ServiceDefinition {
    /** Service identifier */
    id: string;
    /** Display name */
    name: string;
    /** Docker compose YAML block */
    dockerCompose: string;
    /** Required volumes */
    volumes: string[];
    /** Service dependencies */
    dependencies?: string[];
    /** Whether service has health check */
    healthCheck?: boolean;
}

/**
 * SimplensConfig YAML structure
 */
export interface SimplensConfig {
    providers: ProviderConfig[];
}

/**
 * Provider configuration in simplens.config.yaml
 */
export interface ProviderConfig {
    /** Package name */
    package: string;
    /** Provider ID */
    id: string;
    /** Required credentials as key-value pairs */
    credentials: Record<string, string>;
    /** Optional configuration */
    optionalConfig?: Record<string, string | number | boolean>;
}

/**
 * Docker compose file structure (simplified)
 */
export interface DockerComposeFile {
    services: Record<string, DockerService>;
    volumes?: Record<string, DockerVolume>;
    networks?: Record<string, DockerNetwork>;
}

export interface DockerService {
    image: string;
    container_name?: string;
    ports?: string[];
    environment?: Record<string, string> | string[];
    volumes?: string[];
    command?: string | string[];
    depends_on?: string[] | Record<string, { condition: string }>;
    healthcheck?: {
        test: string | string[];
        interval?: string;
        timeout?: string;
        retries?: number;
        start_period?: string;
    };
}

export interface DockerVolume {
    driver?: string;
    driver_opts?: Record<string, string>;
}

export interface DockerNetwork {
    driver?: string;
}
