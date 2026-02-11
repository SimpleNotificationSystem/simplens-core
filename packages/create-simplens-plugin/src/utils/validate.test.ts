import { describe, it, expect } from 'vitest';
import {
    validatePluginName,
    validateChannel,
    validateDescription,
    validateEmail,
    validateAuthor,
} from './validate.js';

describe('validation utilities', () => {
    describe('validatePluginName', () => {
        it('should accept valid kebab-case names', () => {
            expect(validatePluginName('discord')).toBe(true);
            expect(validatePluginName('twilio-sms')).toBe(true);
            expect(validatePluginName('my-awesome-plugin')).toBe(true);
        });

        it('should reject empty names', () => {
            expect(validatePluginName('')).toBe('Plugin name is required');
            expect(validatePluginName('   ')).toBe('Plugin name is required');
        });

        it('should reject names with uppercase letters', () => {
            expect(validatePluginName('Discord')).toBe(
                'Plugin name must be lowercase kebab-case (e.g., discord, twilio-sms)'
            );
        });

        it('should reject names starting with numbers', () => {
            expect(validatePluginName('123plugin')).toBe(
                'Plugin name must be lowercase kebab-case (e.g., discord, twilio-sms)'
            );
        });

        it('should reject names with plugin- prefix', () => {
            expect(validatePluginName('plugin-discord')).toBe(
                'Plugin name should not include "plugin-" prefix'
            );
        });

        it('should reject names with special characters', () => {
            expect(validatePluginName('discord_webhook')).toBe(
                'Plugin name must be lowercase kebab-case (e.g., discord, twilio-sms)'
            );
        });
    });

    describe('validateChannel', () => {
        it('should accept valid channel identifiers', () => {
            expect(validateChannel('discord')).toBe(true);
            expect(validateChannel('sms')).toBe(true);
            expect(validateChannel('email123')).toBe(true);
        });

        it('should reject empty channels', () => {
            expect(validateChannel('')).toBe('Channel identifier is required');
            expect(validateChannel('   ')).toBe('Channel identifier is required');
        });

        it('should reject channels with hyphens', () => {
            expect(validateChannel('my-channel')).toBe(
                'Channel must be lowercase alphanumeric (e.g., discord, sms)'
            );
        });

        it('should reject channels with uppercase', () => {
            expect(validateChannel('Discord')).toBe(
                'Channel must be lowercase alphanumeric (e.g., discord, sms)'
            );
        });

        it('should reject channels starting with numbers', () => {
            expect(validateChannel('123channel')).toBe(
                'Channel must be lowercase alphanumeric (e.g., discord, sms)'
            );
        });
    });

    describe('validateDescription', () => {
        it('should accept valid descriptions', () => {
            expect(validateDescription('Send notifications via Discord')).toBe(true);
            expect(validateDescription('A minimum length description')).toBe(true);
        });

        it('should reject empty descriptions', () => {
            expect(validateDescription('')).toBe('Description is required');
            expect(validateDescription('   ')).toBe('Description is required');
        });

        it('should reject descriptions shorter than 10 characters', () => {
            expect(validateDescription('Too short')).toBe(
                'Description must be at least 10 characters'
            );
            expect(validateDescription('Short')).toBe(
                'Description must be at least 10 characters'
            );
        });
    });

    describe('validateEmail', () => {
        it('should accept valid emails', () => {
            expect(validateEmail('test@example.com')).toBe(true);
            expect(validateEmail('user.name@domain.org')).toBe(true);
        });

        it('should accept empty emails (optional field)', () => {
            expect(validateEmail('')).toBe(true);
            expect(validateEmail('   ')).toBe(true);
        });

        it('should reject invalid email formats', () => {
            expect(validateEmail('invalid')).toBe('Please enter a valid email address');
            expect(validateEmail('invalid@')).toBe('Please enter a valid email address');
            expect(validateEmail('@domain.com')).toBe('Please enter a valid email address');
            expect(validateEmail('user@domain')).toBe('Please enter a valid email address');
        });
    });

    describe('validateAuthor', () => {
        it('should accept non-empty author names', () => {
            expect(validateAuthor('John Doe')).toBe(true);
            expect(validateAuthor('Jane')).toBe(true);
        });

        it('should reject empty author names', () => {
            expect(validateAuthor('')).toBe('Author name is required');
            expect(validateAuthor('   ')).toBe('Author name is required');
        });
    });
});
