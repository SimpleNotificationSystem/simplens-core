import { pascalCase as toPascalCase, camelCase as toCamelCase, snakeCase as toSnakeCase, constantCase as toConstantCase } from 'change-case';

/**
 * Converts a string to PascalCase
 * @example pascalCase('discord-webhook') => 'DiscordWebhook'
 */
export function pascalCase(str: string): string {
    return toPascalCase(str);
}

/**
 * Converts a string to camelCase
 * @example camelCase('discord-webhook') => 'discordWebhook'
 */
export function camelCase(str: string): string {
    return toCamelCase(str);
}

/**
 * Converts a string to snake_case
 * @example snakeCase('discordWebhook') => 'discord_webhook'
 */
export function snakeCase(str: string): string {
    return toSnakeCase(str);
}

/**
 * Converts a string to SCREAMING_SNAKE_CASE (constant case)
 * @example screamingSnakeCase('apiKey') => 'API_KEY'
 */
export function screamingSnakeCase(str: string): string {
    return toConstantCase(str);
}

/**
 * Converts a string to kebab-case
 * @example kebabCase('DiscordWebhook') => 'discord-webhook'
 */
export function kebabCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase();
}
