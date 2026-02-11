export interface PluginConfig {
    /** Plugin name in kebab-case (e.g., discord, telegram, twilio-sms) */
    name: string;

    /** Human-readable display name (e.g., Discord, Telegram, Twilio SMS) */
    displayName: string;

    /** Plugin description */
    description: string;

    /** Channel identifier (lowercase, alphanumeric) */
    channel: string;

    /** Author name */
    author: string;

    /** Author email (optional) */
    email?: string;

    /** Required credentials for the provider */
    credentials: string[];

    /** Sample recipient fields to include */
    recipientFields: string[];

    /** Sample content fields to include */
    contentFields: string[];

    /** Output directory */
    directory: string;

    /** Initialize git repository */
    initGit: boolean;

    /** Install dependencies after generation */
    installDeps: boolean;
}

export interface CliOptions {
    name?: string;
    channel?: string;
    directory?: string;
    yes?: boolean;
    git?: boolean;
    install?: boolean;
}

export interface TemplateFile {
    /** Template filename (e.g., package.json.hbs) */
    template: string;

    /** Output path relative to plugin directory */
    output: string;
}
