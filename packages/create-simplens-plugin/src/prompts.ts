import inquirer from 'inquirer';
import { pascalCase } from './utils/case.js';
import {
    validatePluginName,
    validateChannel,
    validateDescription,
    validateAuthor,
    validateEmail,
} from './utils/validate.js';
import type { PluginConfig, CliOptions } from './types.js';

/**
 * Run interactive prompts to collect plugin configuration
 * @param defaults - Default values from CLI flags
 * @returns Complete plugin configuration
 */
export async function runInteractivePrompts(defaults: CliOptions): Promise<PluginConfig> {
    console.log('\n🔌 Create SimpleNS Plugin\n');

    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: 'Plugin name (e.g., discord, telegram, twilio-sms):',
            default: defaults.name,
            validate: validatePluginName,
        },
        {
            type: 'input',
            name: 'displayName',
            message: 'Display name (human readable):',
            default: (answers: { name: string }) => pascalCase(answers.name),
        },
        {
            type: 'input',
            name: 'description',
            message: 'Description:',
            default: (answers: { displayName: string }) =>
                `Send notifications via ${answers.displayName}`,
            validate: validateDescription,
        },
        {
            type: 'input',
            name: 'channel',
            message: 'Channel identifier (lowercase):',
            default: (answers: { name: string }) =>
                defaults.channel || answers.name.replace(/-/g, ''),
            validate: validateChannel,
        },
        {
            type: 'input',
            name: 'author',
            message: 'Author name:',
            validate: validateAuthor,
        },
        {
            type: 'input',
            name: 'email',
            message: 'Author email (optional):',
            validate: validateEmail,
        },
        {
            type: 'input',
            name: 'directory',
            message: 'Output directory:',
            default: (answers: { name: string }) =>
                defaults.directory || `plugin-${answers.name}`,
        },
        {
            type: 'confirm',
            name: 'initGit',
            message: 'Initialize git repository?',
            default: defaults.git !== false,
        },
        {
            type: 'confirm',
            name: 'installDeps',
            message: 'Install dependencies after generation?',
            default: defaults.install !== false,
        },
    ]);

    return answers as PluginConfig;
}

/**
 * Get default configuration when using --yes flag
 * @param options - CLI options
 * @returns Default plugin configuration
 */
export function getDefaultConfig(options: CliOptions): PluginConfig {
    const name = options.name || 'my-plugin';
    const channel = options.channel || name.replace(/-/g, '');

    return {
        name,
        displayName: pascalCase(name),
        description: `Send notifications via ${pascalCase(name)}`,
        channel,
        author: 'Unknown',
        email: '',
        credentials: [],
        recipientFields: ['userId'],
        contentFields: ['message'],
        directory: options.directory || `plugin-${name}`,
        initGit: options.git !== false,
        installDeps: options.install !== false,
    };
}
