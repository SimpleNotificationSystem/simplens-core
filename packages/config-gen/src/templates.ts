/**
 * Template Generators
 * 
 * Generates provider entries with credential placeholders.
 */

import type { ProviderManifest } from './manifest.js';
import type { ProviderEntry } from './yaml-utils.js';

/**
 * Generate a provider entry for the config file
 */
export function generateProviderEntry(
    packageName: string,
    providerId: string,
    manifest: ProviderManifest
): ProviderEntry {
    const entry: ProviderEntry = {
        package: packageName,
        id: providerId,
        credentials: generateCredentialPlaceholders(manifest.requiredCredentials),
        options: {
            priority: 1,
            rateLimit: { maxTokens: 100, refillRate: 10 }
        }
    };

    // Only add optionalConfig if there are any
    const optionalConfig = generateOptionalPlaceholders(manifest.optionalConfig);
    if (optionalConfig && Object.keys(optionalConfig).length > 0) {
        entry.optionalConfig = optionalConfig;
    }

    return entry;
}

/**
 * Generate credential placeholders with ${ENV_VAR} syntax
 */
function generateCredentialPlaceholders(credentials: string[] = []): Record<string, string> {
    const result: Record<string, string> = {};
    for (const cred of credentials) {
        result[cred] = `\${${toEnvVarName(cred)}}`;
    }
    return result;
}

/**
 * Generate optional config placeholders
 */
function generateOptionalPlaceholders(optionalConfig?: string[]): Record<string, string> | undefined {
    if (!optionalConfig || optionalConfig.length === 0) return undefined;

    const result: Record<string, string> = {};
    for (const opt of optionalConfig) {
        result[opt] = `\${${toEnvVarName(opt)}}`;
    }
    return result;
}

/**
 * Convert camelCase or plain name to UPPER_SNAKE_CASE
 */
function toEnvVarName(name: string): string {
    return name
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .toUpperCase();
}
