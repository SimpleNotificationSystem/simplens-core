/**
 * Unit Tests for Discord Channel Provider
 * Tests Discord webhook formatting and message sending
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiscordChannel } from '../../../src/admin-alerts/channels/discord.channel.js';
import type { AlertMetadata } from '../../../src/admin-alerts/admin-channel.interface.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('DiscordChannel', () => {
    const validWebhookUrl = 'https://discord.com/api/webhooks/123456789/abcdefghijk';

    beforeEach(() => {
        mockFetch.mockReset();
    });

    describe('constructor', () => {
        it('should create instance with valid webhook URL', () => {
            const channel = new DiscordChannel(validWebhookUrl);
            expect(channel.channelType).toBe('discord');
        });
    });

    describe('send', () => {
        it('should send message successfully with default severity', async () => {
            mockFetch.mockResolvedValueOnce({ ok: true });

            const channel = new DiscordChannel(validWebhookUrl);
            const result = await channel.send('Test alert message');

            expect(result.success).toBe(true);
            expect(mockFetch).toHaveBeenCalledTimes(1);
            
            const [url, options] = mockFetch.mock.calls[0];
            expect(url).toBe(validWebhookUrl);
            expect(options.method).toBe('POST');
            expect(options.headers['Content-Type']).toBe('application/json');
            
            const body = JSON.parse(options.body);
            expect(body.embeds).toHaveLength(1);
            expect(body.embeds[0].description).toBe('Test alert message');
        });

        it('should use correct color for critical severity', async () => {
            mockFetch.mockResolvedValueOnce({ ok: true });

            const channel = new DiscordChannel(validWebhookUrl);
            const metadata: AlertMetadata = { severity: 'critical' };
            await channel.send('Critical alert', metadata);

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.embeds[0].color).toBe(15158332); // Red
        });

        it('should use correct color for warning severity', async () => {
            mockFetch.mockResolvedValueOnce({ ok: true });

            const channel = new DiscordChannel(validWebhookUrl);
            const metadata: AlertMetadata = { severity: 'warning' };
            await channel.send('Warning alert', metadata);

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.embeds[0].color).toBe(16776960); // Yellow
        });

        it('should use correct color for info severity', async () => {
            mockFetch.mockResolvedValueOnce({ ok: true });

            const channel = new DiscordChannel(validWebhookUrl);
            const metadata: AlertMetadata = { severity: 'info' };
            await channel.send('Info alert', metadata);

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.embeds[0].color).toBe(3447003); // Blue
        });

        it('should include alert type in title when provided', async () => {
            mockFetch.mockResolvedValueOnce({ ok: true });

            const channel = new DiscordChannel(validWebhookUrl);
            const metadata: AlertMetadata = { alertType: 'failed_notification' };
            await channel.send('Test message', metadata);

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.embeds[0].title).toContain('Failed Notification');
        });

        it('should include metadata fields in embed', async () => {
            mockFetch.mockResolvedValueOnce({ ok: true });

            const channel = new DiscordChannel(validWebhookUrl);
            const metadata: AlertMetadata = {
                severity: 'critical',
                notificationId: '507f1f77bcf86cd799439011',
                channel: 'email',
            };
            await channel.send('Test with metadata', metadata);

            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            const fields = body.embeds[0].fields;
            expect(fields).toContainEqual({ name: 'Notification ID', value: '507f1f77bcf86cd799439011', inline: true });
            expect(fields).toContainEqual({ name: 'Channel', value: 'email', inline: true });
        });

        it('should return error result when fetch fails', async () => {
            mockFetch.mockResolvedValueOnce({ 
                ok: false, 
                status: 400,
                text: async () => 'Bad Request'
            });

            const channel = new DiscordChannel(validWebhookUrl);
            const result = await channel.send('Test message');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Discord API error');
        });

        it('should return error result when network fails', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const channel = new DiscordChannel(validWebhookUrl);
            const result = await channel.send('Test message');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Network error');
        });
    });

    describe('testConnection', () => {
        it('should send test message successfully', async () => {
            mockFetch.mockResolvedValueOnce({ ok: true });

            const channel = new DiscordChannel(validWebhookUrl);
            const result = await channel.testConnection();

            expect(result.success).toBe(true);
            
            const body = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(body.embeds[0].title).toContain('Service Health');
            expect(body.embeds[0].color).toBe(3447003); // Blue (info severity)
        });

        it('should return error when test fails', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Connection failed'));

            const channel = new DiscordChannel(validWebhookUrl);
            const result = await channel.testConnection();

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });
});
