import { describe, it, expect } from 'vitest';
import { getDefaultConfig } from './prompts.js';
import type { CliOptions } from './types.js';

describe('prompts', () => {
    describe('getDefaultConfig', () => {
        it('should generate default config from name', () => {
            const options: CliOptions = { name: 'discord' };
            const config = getDefaultConfig(options);

            expect(config.name).toBe('discord');
            expect(config.displayName).toBe('Discord');
            expect(config.description).toBe('Send notifications via Discord');
            expect(config.channel).toBe('discord');
            expect(config.directory).toBe('plugin-discord');
            expect(config.author).toBe('Unknown');
            expect(config.email).toBe('');
            expect(config.initGit).toBe(true);
            expect(config.installDeps).toBe(true);
        });

        it('should handle kebab-case names', () => {
            const options: CliOptions = { name: 'twilio-sms' };
            const config = getDefaultConfig(options);

            expect(config.name).toBe('twilio-sms');
            expect(config.displayName).toBe('TwilioSms');
            expect(config.channel).toBe('twiliosms');
            expect(config.directory).toBe('plugin-twilio-sms');
        });

        it('should use provided channel if specified', () => {
            const options: CliOptions = { name: 'twilio-sms', channel: 'sms' };
            const config = getDefaultConfig(options);

            expect(config.channel).toBe('sms');
        });

        it('should use provided directory if specified', () => {
            const options: CliOptions = { name: 'discord', directory: 'my-discord-plugin' };
            const config = getDefaultConfig(options);

            expect(config.directory).toBe('my-discord-plugin');
        });

        it('should respect git flag', () => {
            const withGit: CliOptions = { name: 'test', git: true };
            const withoutGit: CliOptions = { name: 'test', git: false };

            expect(getDefaultConfig(withGit).initGit).toBe(true);
            expect(getDefaultConfig(withoutGit).initGit).toBe(false);
        });

        it('should respect install flag', () => {
            const withInstall: CliOptions = { name: 'test', install: true };
            const withoutInstall: CliOptions = { name: 'test', install: false };

            expect(getDefaultConfig(withInstall).installDeps).toBe(true);
            expect(getDefaultConfig(withoutInstall).installDeps).toBe(false);
        });

        it('should use default name when not provided', () => {
            const options: CliOptions = {};
            const config = getDefaultConfig(options);

            expect(config.name).toBe('my-plugin');
            expect(config.displayName).toBe('MyPlugin');
        });
    });
});
