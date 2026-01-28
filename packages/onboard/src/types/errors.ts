/**
 * Custom error types for better error handling and troubleshooting
 */

/**
 * Base error class for all onboarding errors
 */
export class OnboardingError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly troubleshooting?: string
    ) {
        super(message);
        this.name = 'OnboardingError';
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Docker-related errors
 */
export class DockerError extends OnboardingError {
    constructor(message: string, troubleshooting?: string) {
        super('DOCKER_ERROR', message, troubleshooting);
        this.name = 'DockerError';
    }
}

export class DockerNotInstalledError extends DockerError {
    constructor() {
        super(
            'Docker is not installed on this system',
            'Please install Docker from: https://docs.docker.com/get-docker/'
        );
        this.name = 'DockerNotInstalledError';
    }
}

export class DockerNotRunningError extends DockerError {
    constructor() {
        super(
            'Docker daemon is not running',
            'Please start Docker Desktop or Docker daemon, then try again'
        );
        this.name = 'DockerNotRunningError';
    }
}

export class DockerPermissionError extends DockerError {
    constructor() {
        super(
            'Permission denied when accessing Docker',
            'Try running with sudo or add your user to the docker group:\n' +
            '  sudo usermod -aG docker $USER\n' +
            '  Then log out and log back in'
        );
        this.name = 'DockerPermissionError';
    }
}

export class DockerComposeError extends DockerError {
    constructor(operation: string, details?: string) {
        super(
            `Failed to ${operation} with docker-compose`,
            details || 'Check docker-compose logs for more details:\n  docker-compose logs'
        );
        this.name = 'DockerComposeError';
    }
}

/**
 * File system errors
 */
export class FileSystemError extends OnboardingError {
    constructor(message: string, public readonly path: string, troubleshooting?: string) {
        super('FILESYSTEM_ERROR', message, troubleshooting);
        this.name = 'FileSystemError';
    }
}

export class DirectoryNotWritableError extends FileSystemError {
    constructor(path: string) {
        super(
            `Directory is not writable: ${path}`,
            path,
            'Check directory permissions or choose a different directory'
        );
        this.name = 'DirectoryNotWritableError';
    }
}

export class FileNotFoundError extends FileSystemError {
    constructor(path: string) {
        super(
            `File not found: ${path}`,
            path,
            'Ensure the file exists or check the path'
        );
        this.name = 'FileNotFoundError';
    }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends OnboardingError {
    constructor(message: string, troubleshooting?: string) {
        super('CONFIG_ERROR', message, troubleshooting);
        this.name = 'ConfigurationError';
    }
}

export class InvalidEnvironmentValueError extends ConfigurationError {
    constructor(key: string, value: string, expectedFormat: string) {
        super(
            `Invalid value for ${key}: ${value}`,
            `Expected format: ${expectedFormat}`
        );
        this.name = 'InvalidEnvironmentValueError';
    }
}

export class PluginConfigurationError extends ConfigurationError {
    constructor(pluginName: string, details: string) {
        super(
            `Failed to configure plugin ${pluginName}`,
            details
        );
        this.name = 'PluginConfigurationError';
    }
}

/**
 * Service health errors
 */
export class ServiceHealthError extends OnboardingError {
    constructor(serviceName: string, timeout: number) {
        super(
            'SERVICE_HEALTH_ERROR',
            `Service '${serviceName}' did not become healthy within ${timeout}ms`,
            `Check service logs:\n  docker-compose logs ${serviceName}\n\n` +
            'Or check container status:\n  docker ps -a'
        );
        this.name = 'ServiceHealthError';
    }
}

/**
 * Type guard to check if an error is an OnboardingError
 */
export function isOnboardingError(error: unknown): error is OnboardingError {
    return error instanceof OnboardingError;
}

/**
 * Format error for user display
 */
export function formatErrorForUser(error: unknown): string {
    if (isOnboardingError(error)) {
        let message = `❌ ${error.message}`;
        if (error.troubleshooting) {
            message += `\n\n💡 Troubleshooting:\n${error.troubleshooting}`;
        }
        return message;
    }
    
    if (error instanceof Error) {
        return `❌ Unexpected error: ${error.message}`;
    }
    
    return `❌ An unknown error occurred`;
}
