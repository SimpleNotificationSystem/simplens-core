import { execa } from 'execa';
import yaml from 'js-yaml';
import crypto from 'crypto';
import { readFile, logInfo, logSuccess, logError, logWarning } from './utils.js';
import { multiselect, text, password } from '@clack/prompts';
import { handleCancel, spinner } from './ui.js';
import path from 'path';
import type { PluginInfo, SimplensConfig } from './types/domain.js';

/**
 * Fetches available SimpleNS plugins using the config-gen CLI tool.
 * Falls back to default plugins if fetching fails.
 *
 * @returns Array of available plugin information
 */
export async function fetchAvailablePlugins(): Promise<PluginInfo[]> {
    const s = spinner();
    s.start('Fetching available plugins...');

    try {
        // Execute config-gen list command
        const { stdout } = await execa('npx', ['@simplens/config-gen', 'list', '--official'], {
            stdio: 'pipe',
        });

        // Parse output to extract plugins
        // Expected format: "  @simplens/package-name      Plugin Name"
        const plugins: PluginInfo[] = [];
        const lines = stdout.split('\n');

        for (const line of lines) {
            // Match plugin lines (starts with @simplens/)
            const match = line.match(/^\s+(@simplens\/[\w-]+)\s+(.+)$/);
            if (match) {
                const [, packageName, rest] = match;
                // Extract name and description
                const parts = rest.split(/\s{2,}/); // Split by multiple spaces
                plugins.push({
                    package: packageName.trim(),
                    name: parts[0]?.trim() || packageName,
                    description: parts[1]?.trim() || '',
                });
            }
        }

        s.stop(`Found ${plugins.length} available plugins`);
        return plugins;
    } catch (error: unknown) {
        s.stop('Could not fetch plugins list. Using defaults.');
        logWarning('Falling back to default plugin list.');
        // Return default plugins as fallback
        return [
            { package: '@simplens/mock', name: 'Mock Provider', description: 'Mock notification provider for testing' },
            { package: '@simplens/nodemailer-gmail', name: 'Gmail', description: 'Send emails via Gmail' },
            { package: '@simplens/resend', name: 'Resend', description: 'Send emails via Resend' },
        ];
    }
}

/**
 * Prompt user to select plugins
 */
export async function promptPluginSelection(availablePlugins: PluginInfo[]): Promise<string[]> {
    if (availablePlugins.length === 0) {
        logWarning('No plugins available to select.');
        return [];
    }

    const selected = await multiselect({
        message: 'Select plugins to install (Space to select, Enter to confirm):',
        options: availablePlugins.map(p => ({
            value: p.package,
            label: `${p.name} (${p.package})`,
            hint: p.description,
        })),
        initialValues: availablePlugins
            .filter(p => p.package === '@simplens/mock')
            .map(p => p.package),
        withGuide: true,
    });

    handleCancel(selected);
    return selected as string[];
}

/**
 * Generate plugin configuration using config-gen
 */
export async function generatePluginConfig(
    targetDir: string,
    selectedPlugins: string[]
): Promise<void> {
    if (selectedPlugins.length === 0) {
        logInfo('No plugins selected, skipping config generation.');
        return;
    }

    const s = spinner();
    s.start(`Generating configuration for ${selectedPlugins.length} plugin(s)...`);

    try {
        // Execute config-gen for all selected plugins
        // Use relative path to avoid WSL path issues when npx runs Windows binaries
        await execa(
            'npx',
            ['@simplens/config-gen', 'gen', ...selectedPlugins, '-o', 'simplens.config.yaml'],
            { cwd: targetDir, stdio: 'pipe' }
        );

        s.stop('Generated simplens.config.yaml');
    } catch (error: unknown) {
        s.error('Failed to generate plugin configuration');
        throw error;
    }
}

/**
 * Parse simplens.config.yaml to extract credential keys
 */
export async function parseConfigCredentials(configPath: string): Promise<string[]> {
    try {
        const content = await readFile(configPath);
        const config: any = yaml.load(content);

        const credentialKeys = new Set<string>();

        // Extract credential keys from providers (ONLY from credentials, not optionalConfig)
        if (config.providers && Array.isArray(config.providers)) {
            for (const provider of config.providers) {
                if (provider.credentials && typeof provider.credentials === 'object') {
                    for (const [key, value] of Object.entries(provider.credentials)) {
                        // Extract env var name from ${ENV_VAR} format
                        if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
                            const envVar = value.slice(2, -1);
                            credentialKeys.add(envVar);
                        }
                    }
                }
                // NOTE: We intentionally skip optionalConfig - those are optional!
            }
        }

        return Array.from(credentialKeys);
    } catch (error) {
        logWarning('Could not parse config file for credentials');
        return [];
    }
}

/**
 * Generate default placeholder values for plugin credentials
 * Used in --full mode for non-interactive setup
 */
export function generateDefaultPluginCredentials(credentialKeys: string[]): Map<string, string> {
    const result = new Map<string, string>();

    for (const key of credentialKeys) {
        // Generate placeholder values based on key name patterns
        if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret')) {
            result.set(key, crypto.randomBytes(16).toString('base64'));
        } else if (key.toLowerCase().includes('apikey') || key.toLowerCase().includes('api_key')) {
            result.set(key, `sk_${crypto.randomBytes(24).toString('base64').slice(0, 32)}`);
        } else if (key.toLowerCase().includes('token')) {
            result.set(key, crypto.randomBytes(32).toString('hex'));
        } else if (key.toLowerCase().includes('email') || key.toLowerCase().includes('user')) {
            result.set(key, 'CHANGE_ME@example.com');
        } else {
            // Generic placeholder
            result.set(key, 'CHANGE_ME');
        }
    }

    return result;
}

/**
 * Prompt for plugin-specific credentials
 */
export async function promptPluginCredentials(credentialKeys: string[]): Promise<Map<string, string>> {
    if (credentialKeys.length === 0) {
        logInfo('No plugin credentials required.');
        return new Map();
    }

    logInfo('Configuring plugin credentials...');

    const result = new Map<string, string>();

    for (const key of credentialKeys) {
        const isSecret = key.toLowerCase().includes('password') || key.toLowerCase().includes('key');

        let answer: string | symbol;
        if (isSecret) {
            answer = await password({
                message: `${key}:`,
                validate: (input: string | undefined) => {
                    if (!input || input.trim().length === 0) {
                        return `${key} is required`;
                    }
                    return undefined;
                },
            });
        } else {
            answer = await text({
                message: `${key}:`,
                validate: (input: string | undefined) => {
                    if (!input || input.trim().length === 0) {
                        return `${key} is required`;
                    }
                    return undefined;
                },
            });
        }

        handleCancel(answer);
        result.set(key, answer as string);
    }

    logSuccess('Plugin credentials configured');
    return result;
}
