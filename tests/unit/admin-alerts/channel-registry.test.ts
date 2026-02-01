/**
 * Unit Tests for Channel Registry
 * Tests the extensible registry pattern for admin alert channels
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    registerChannelProvider,
    getChannelProvider,
    hasChannelProvider,
    getRegisteredChannelTypes,
} from '../../../src/admin-alerts/channel-registry.js';
import type { AdminChannelProvider, ChannelResult, AlertMetadata } from '../../../src/admin-alerts/admin-channel.interface.js';

// Mock channel provider for testing
class MockChannel implements AdminChannelProvider {
    readonly channelType = 'discord' as const;
    public sendCalled = false;
    public testCalled = false;
    public lastMessage = '';

    constructor(public webhookUrl: string) {}

    async send(message: string, metadata?: AlertMetadata): Promise<ChannelResult> {
        this.sendCalled = true;
        this.lastMessage = message;
        return { success: true };
    }

    async testConnection(): Promise<ChannelResult> {
        this.testCalled = true;
        return { success: true };
    }
}

describe('Channel Registry', () => {
    // Note: The registry is a singleton, so tests may affect each other
    // In a real scenario, we'd want to reset the registry between tests
    
    describe('registerChannelProvider', () => {
        it('should register a channel provider without error', () => {
            expect(() => {
                registerChannelProvider('discord', (config) => new MockChannel((config as { webhook_url: string }).webhook_url));
            }).not.toThrow();
        });
    });

    describe('hasChannelProvider', () => {
        it('should return true for registered channel type', () => {
            // Discord is registered by importing discord.channel.ts
            expect(hasChannelProvider('discord')).toBe(true);
        });

        it('should return false for unregistered channel type', () => {
            expect(hasChannelProvider('telegram')).toBe(false);
        });
    });

    describe('getChannelProvider', () => {
        it('should return a provider instance for registered channel type', () => {
            const config = { webhook_url: 'https://discord.com/api/webhooks/123/abc' };
            const provider = getChannelProvider('discord', config);

            expect(provider).toBeDefined();
            expect(provider.channelType).toBe('discord');
        });

        it('should throw error for unregistered channel type', () => {
            expect(() => {
                getChannelProvider('telegram', {});
            }).toThrow('No provider registered for channel type: telegram');
        });
    });

    describe('getRegisteredChannelTypes', () => {
        it('should return array of registered channel types', () => {
            const types = getRegisteredChannelTypes();

            expect(Array.isArray(types)).toBe(true);
            expect(types).toContain('discord');
        });
    });
});
