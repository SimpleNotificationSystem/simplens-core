import inquirer from 'inquirer';
import { execa } from 'execa';
import yaml from 'js-yaml';
import { readFile, logInfo, logSuccess, logError, logWarning } from './utils.js';
import path from 'path';
import type { PluginInfo, SimplensConfig } from './types/domain.js';

/**
 * Fetches available SimpleNS plugins using the config-gen CLI tool.
 * Falls back to default plugins if fetching fails.
 * 
 * @returns Array of available plugin information
 * 
 * @remarks
 * Uses `npx @simplens/config-gen list --official` to fetch plugins.
 * Default fallback plugins: mock, nodemailer-gmail, resend
 * 
 * @example
 * ```ts
 * const plugins = await fetchAvailablePlugins();
 * // Returns: [{ package: '@simplens/mock', name: 'Mock Provider', ... }, ...]
 * ```
 */
export async function fetchAvailablePlugins(): Promise<PluginInfo[]> {
    logInfo('Fetching available plugins...');

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

        logSuccess(`Found ${plugins.length} available plugins`);
        return plugins;
    } catch (error: any) {
        logWarning('Could not fetch plugins list. Using defaults.');
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

    const answer = await inquirer.prompt<{ plugins: string[] }>([
        {
            type: 'checkbox',
            name: 'plugins',
            message: 'Select plugins to install (Space to toggle, Enter to confirm):',
            choices: availablePlugins.map(p => ({
                name: `${p.name} (${p.package}) - ${p.description}`,
                value: p.package,
                checked: p.package === '@simplens/mock', // Mock checked by default
            })),
        },
    ]);

    return answer.plugins;
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

    logInfo(`Generating configuration for ${selectedPlugins.length} plugin(s)...`);

    try {
        const configPath = path.join(targetDir, 'simplens.config.yaml');
        
        // Execute config-gen for all selected plugins
        // Use relative path to avoid WSL path issues when npx runs Windows binaries
        await execa(
            'npx',
            ['@simplens/config-gen', 'gen', ...selectedPlugins, '-o', 'simplens.config.yaml'],
            { cwd: targetDir, stdio: 'inherit' }
        );

        logSuccess('Generated simplens.config.yaml');
    } catch (error: any) {
        logError('Failed to generate plugin configuration');
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
        const answer = await inquirer.prompt<{ value: string }>([
            {
                type: key.toLowerCase().includes('password') || key.toLowerCase().includes('key') 
                    ? 'password' 
                    : 'input',
                name: 'value',
                message: `${key}:`,
                validate: (input: string) => {
                    if (!input || input.trim().length === 0) {
                        return `${key} is required`;
                    }
                    return true;
                },
            },
        ]);
        result.set(key, answer.value);
    }

    logSuccess('Plugin credentials configured');
    return result;
}
