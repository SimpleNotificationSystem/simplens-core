import { describe, it, expect } from 'vitest';
import { pascalCase, camelCase, snakeCase, screamingSnakeCase, kebabCase } from './case.js';

describe('case utilities', () => {
    describe('pascalCase', () => {
        it('should convert kebab-case to PascalCase', () => {
            expect(pascalCase('discord-webhook')).toBe('DiscordWebhook');
        });

        it('should convert single word to PascalCase', () => {
            expect(pascalCase('discord')).toBe('Discord');
        });

        it('should handle multiple hyphens', () => {
            expect(pascalCase('twilio-sms-api')).toBe('TwilioSmsApi');
        });

        it('should handle already PascalCase', () => {
            expect(pascalCase('Discord')).toBe('Discord');
        });
    });

    describe('camelCase', () => {
        it('should convert kebab-case to camelCase', () => {
            expect(camelCase('discord-webhook')).toBe('discordWebhook');
        });

        it('should convert single word to camelCase', () => {
            expect(camelCase('discord')).toBe('discord');
        });

        it('should handle multiple hyphens', () => {
            expect(camelCase('twilio-sms-api')).toBe('twilioSmsApi');
        });
    });

    describe('snakeCase', () => {
        it('should convert camelCase to snake_case', () => {
            expect(snakeCase('discordWebhook')).toBe('discord_webhook');
        });

        it('should convert PascalCase to snake_case', () => {
            expect(snakeCase('DiscordWebhook')).toBe('discord_webhook');
        });

        it('should handle single word', () => {
            expect(snakeCase('discord')).toBe('discord');
        });
    });

    describe('screamingSnakeCase', () => {
        it('should convert camelCase to SCREAMING_SNAKE_CASE', () => {
            expect(screamingSnakeCase('apiKey')).toBe('API_KEY');
        });

        it('should convert kebab-case to SCREAMING_SNAKE_CASE', () => {
            expect(screamingSnakeCase('api-key')).toBe('API_KEY');
        });

        it('should handle single word', () => {
            expect(screamingSnakeCase('api')).toBe('API');
        });
    });

    describe('kebabCase', () => {
        it('should convert PascalCase to kebab-case', () => {
            expect(kebabCase('DiscordWebhook')).toBe('discord-webhook');
        });

        it('should convert camelCase to kebab-case', () => {
            expect(kebabCase('discordWebhook')).toBe('discord-webhook');
        });

        it('should handle single word', () => {
            expect(kebabCase('Discord')).toBe('discord');
        });

        it('should handle spaces and underscores', () => {
            expect(kebabCase('discord_webhook')).toBe('discord-webhook');
            expect(kebabCase('discord webhook')).toBe('discord-webhook');
        });
    });
});
