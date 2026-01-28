import { execa } from 'execa';
import { logError, logSuccess, logWarning } from './utils.js';
import {
    DockerNotInstalledError,
    DockerNotRunningError,
    DockerPermissionError,
} from './types/errors.js';
import { VALIDATION } from './config/constants.js';

export type OSType = 'windows' | 'linux' | 'darwin';

/**
 * Checks if Docker is installed on the system by running `docker --version`.
 * 
 * @throws {DockerNotInstalledError} When Docker is not found in PATH or not installed
 * 
 * @example
 * ```ts
 * try {
 *   await checkDockerInstalled();
 *   console.log('Docker is available');
 * } catch (error) {
 *   // Handle DockerNotInstalledError
 * }
 * ```
 */
export async function checkDockerInstalled(): Promise<void> {
    try {
        await execa('docker', ['--version']);
    } catch (error: any) {
        throw new DockerNotInstalledError();
    }
}

/**
 * Checks if the Docker daemon is running by executing `docker ps`.
 * Provides specific error types based on the failure reason.
 * 
 * @throws {DockerPermissionError} When user lacks permissions to access Docker socket
 * @throws {DockerNotRunningError} When Docker daemon is not running or unreachable
 * 
 * @example
 * ```ts
 * try {
 *   await checkDockerRunning();
 * } catch (error) {
 *   if (error instanceof DockerPermissionError) {
 *     // Guide user to add sudo or docker group
 *   }
 * }
 * ```
 */
export async function checkDockerRunning(): Promise<void> {
    try {
        await execa('docker', ['ps']);
    } catch (error: any) {
        const errorMessage = error.message?.toLowerCase() || '';
        
        if (errorMessage.includes('permission denied') || errorMessage.includes('eacces')) {
            throw new DockerPermissionError();
        }
        
        if (errorMessage.includes('cannot connect') || errorMessage.includes('is the docker daemon running')) {
            throw new DockerNotRunningError();
        }
        
        // Generic docker error
        throw new DockerNotRunningError();
    }
}

/**
 * Detects the operating system platform.
 * 
 * @returns OS type: 'windows', 'darwin' (macOS), or 'linux'
 * @note Defaults to 'linux' for unknown platforms
 * 
 * @example
 * ```ts
 * const os = detectOS();
 * if (os === 'linux') {
 *   // Linux-specific configuration
 * }
 * ```
 */
export function detectOS(): OSType {
    const platform = process.platform;
    if (platform === 'win32') return 'windows';
    if (platform === 'linux') return 'linux';
    if (platform === 'darwin') return 'darwin';
    return 'linux'; // Default fallback
}

/**
 * Validates all system prerequisites before starting the onboarding process.
 * Checks Docker installation, daemon status, and detects the operating system.
 * 
 * @throws {DockerNotInstalledError} If Docker is not installed
 * @throws {DockerNotRunningError} If Docker daemon is not running  
 * @throws {DockerPermissionError} If user lacks Docker permissions
 * 
 * @example
 * ```ts
 * try {
 *   await validatePrerequisites();
 *   // Proceed with setup
 * } catch (error) {
 *   // Handle prerequisite errors
 * }
 * ```
 */
export async function validatePrerequisites(): Promise<void> {
    console.log('\n🔍 Checking prerequisites...\n');

    // Check Docker installation
    try {
        await checkDockerInstalled();
        logSuccess('Docker is installed');
    } catch (error) {
        // Error will be caught by main() and displayed with troubleshooting
        throw error;
    }

    // Check Docker daemon
    try {
        await checkDockerRunning();
        logSuccess('Docker daemon is running');
    } catch (error) {
        // Error will be caught by main() and displayed with troubleshooting
        throw error;
    }

    // Detect OS
    const os = detectOS();
    logSuccess(`Detected OS: ${os}`);

    if (os === 'linux') {
        logWarning('Linux detected: You may need to provide your machine IP for infra services.');
    }
}

/**
 * Validates environment variable values based on the variable name/type.
 * Performs format-specific validation for URLs, ports, and security credentials.
 * 
 * @param key - Environment variable name (e.g., 'MONGO_URI', 'PORT', 'API_KEY')
 * @param value - Value to validate
 * @returns `true` if valid, `false` otherwise
 * 
 * @remarks
 * Validation rules:
 * - URLs: Must contain protocol (mongodb://, redis://)
 * - Ports: Must be 1-65535
 * - Secrets/Keys/Passwords: Must be at least 8 characters
 * 
 * @example
 * ```ts
 * validateEnvValue('MONGO_URI', 'mongodb://localhost:27017'); // true
 * validateEnvValue('PORT', '3000'); // true
 * validateEnvValue('API_KEY', 'short'); // false (too short)
 * ```
 */
export function validateEnvValue(key: string, value: string): boolean {
    // URL validation
    if (key.includes('URL') || key.includes('URI')) {
        if (!value) return false;
        // Basic URL format check
        if (key === 'MONGO_URI' && !value.includes('mongodb://')) {
            return false;
        }
        if (key === 'REDIS_URL' && !value.includes('redis://')) {
            return false;
        }
    }

    // Port validation
    if (key.includes('PORT')) {
        const port = parseInt(value, 10);
        if (isNaN(port) || port < VALIDATION.PORT_MIN || port > VALIDATION.PORT_MAX) {
            return false;
        }
    }

    // API Key validation (should not be empty for security)
    if (key.includes('API_KEY') || key.includes('SECRET') || key.includes('PASSWORD')) {
        if (!value || value.length < VALIDATION.MIN_PASSWORD_LENGTH) {
            return false;
        }
    }

    return true;
}
