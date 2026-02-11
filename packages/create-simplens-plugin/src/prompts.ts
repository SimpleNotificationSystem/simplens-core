import { text, confirm } from '@clack/prompts';
import { handleCancel } from './ui.js';
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
    // Plugin name
    const nameResult = await text({
        message: 'Plugin name (e.g., discord, telegram, twilio-sms):',
        placeholder: defaults.name || 'my-plugin',
        defaultValue: defaults.name,
        validate: (value: string | undefined) => {
            if (!value) return 'Plugin name is required';
            const validation = validatePluginName(value);
            return validation === true ? undefined : validation;
        },
    });
    handleCancel(nameResult);
    const name = nameResult as string;

    // Display name
    const displayNameResult = await text({
        message: 'Display name (human readable):',
        placeholder: pascalCase(name),
        defaultValue: pascalCase(name),
    });
    handleCancel(displayNameResult);
    const displayName = displayNameResult as string;

    // Description
    const descriptionResult = await text({
        message: 'Description:',
        placeholder: `Send notifications via ${displayName}`,
        defaultValue: `Send notifications via ${displayName}`,
        validate: (value: string | undefined) => {
            if (!value) return undefined;
            const validation = validateDescription(value);
            return validation === true ? undefined : validation;
        },
    });
    handleCancel(descriptionResult);
    const description = descriptionResult as string;

    // Channel
    const channelResult = await text({
        message: 'Channel identifier (lowercase):',
        placeholder: defaults.channel || name.replace(/-/g, ''),
        defaultValue: defaults.channel || name.replace(/-/g, ''),
        validate: (value: string | undefined) => {
            if (!value) return 'Channel identifier is required';
            const validation = validateChannel(value);
            return validation === true ? undefined : validation;
        },
    });
    handleCancel(channelResult);
    const channel = channelResult as string;

    // Author name
    const authorResult = await text({
        message: 'Author name:',
        placeholder: 'Your Name',
        validate: (value: string | undefined) => {
            if (!value) return 'Author name is required';
            const validation = validateAuthor(value);
            return validation === true ? undefined : validation;
        },
    });
    handleCancel(authorResult);
    const author = authorResult as string;

    // Email
    const emailResult = await text({
        message: 'Author email (optional):',
        placeholder: 'you@example.com',
        validate: (value: string | undefined) => {
            if (!value || value.trim() === '') return undefined;
            const validation = validateEmail(value);
            return validation === true ? undefined : validation;
        },
    });
    handleCancel(emailResult);
    const email = (emailResult as string) || '';

    // Output directory
    const directoryResult = await text({
        message: 'Output directory:',
        placeholder: defaults.directory || `plugin-${name}`,
        defaultValue: defaults.directory || `plugin-${name}`,
    });
    handleCancel(directoryResult);
    const directory = directoryResult as string;

    // Git initialization
    const initGitResult = await confirm({
        message: 'Initialize git repository?',
        initialValue: defaults.git !== false,
    });
    handleCancel(initGitResult);
    const initGit = initGitResult as boolean;

    // Install dependencies
    const installDepsResult = await confirm({
        message: 'Install dependencies after generation?',
        initialValue: defaults.install !== false,
    });
    handleCancel(installDepsResult);
    const installDeps = installDepsResult as boolean;

    return {
        name,
        displayName,
        description,
        channel,
        author,
        email,
        credentials: [],
        recipientFields: ['userId'],
        contentFields: ['message'],
        directory,
        initGit,
        installDeps,
    };
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
