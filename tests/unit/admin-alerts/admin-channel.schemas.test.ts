/**
 * Unit Tests for Admin Channel Schemas
 * Tests zod schema validation for admin notification channel types
 */

import { describe, it, expect } from 'vitest';
import {
    encryptedConfigSchema,
    alertFiltersSchema,
    adminChannelSchema,
    systemConfigSchema,
    discordConfigSchema,
    ADMIN_CHANNEL_TYPE,
    ADMIN_ALERT_TYPE,
} from '../../../src/types/schemas.js';

describe('Admin Channel Schemas', () => {
    describe('ADMIN_CHANNEL_TYPE', () => {
        it('should contain expected channel types', () => {
            expect(ADMIN_CHANNEL_TYPE).toContain('discord');
            expect(ADMIN_CHANNEL_TYPE).toContain('telegram');
            expect(ADMIN_CHANNEL_TYPE).toContain('email');
            expect(ADMIN_CHANNEL_TYPE).toContain('slack');
        });
    });

    describe('ADMIN_ALERT_TYPE', () => {
        it('should contain expected alert types', () => {
            expect(ADMIN_ALERT_TYPE).toContain('failed_notification');
            expect(ADMIN_ALERT_TYPE).toContain('service_health');
            expect(ADMIN_ALERT_TYPE).toContain('stuck_processing');
            expect(ADMIN_ALERT_TYPE).toContain('orphaned_pending');
            expect(ADMIN_ALERT_TYPE).toContain('ghost_delivery');
        });
    });

    describe('encryptedConfigSchema', () => {
        it('should validate valid encrypted config', () => {
            const validConfig = {
                encrypted_data: 'abc123encrypted',
                iv: 'iv123456789',
                auth_tag: 'authtag123',
            };

            const result = encryptedConfigSchema.safeParse(validConfig);
            expect(result.success).toBe(true);
        });

        it('should fail for missing encrypted_data', () => {
            const invalidConfig = {
                iv: 'iv123',
                auth_tag: 'tag123',
            };

            const result = encryptedConfigSchema.safeParse(invalidConfig);
            expect(result.success).toBe(false);
        });

        it('should fail for missing iv', () => {
            const invalidConfig = {
                encrypted_data: 'data123',
                auth_tag: 'tag123',
            };

            const result = encryptedConfigSchema.safeParse(invalidConfig);
            expect(result.success).toBe(false);
        });

        it('should fail for missing auth_tag', () => {
            const invalidConfig = {
                encrypted_data: 'data123',
                iv: 'iv123',
            };

            const result = encryptedConfigSchema.safeParse(invalidConfig);
            expect(result.success).toBe(false);
        });
    });

    describe('alertFiltersSchema', () => {
        it('should validate all filters set to true', () => {
            const filters = {
                failed_notifications: true,
                service_health: true,
                stuck_processing: true,
                orphaned_pending: true,
                ghost_delivery: true,
            };

            const result = alertFiltersSchema.safeParse(filters);
            expect(result.success).toBe(true);
        });

        it('should validate all filters set to false', () => {
            const filters = {
                failed_notifications: false,
                service_health: false,
                stuck_processing: false,
                orphaned_pending: false,
                ghost_delivery: false,
            };

            const result = alertFiltersSchema.safeParse(filters);
            expect(result.success).toBe(true);
        });

        it('should apply default values for missing filters', () => {
            const partialFilters = {};

            const result = alertFiltersSchema.safeParse(partialFilters);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.failed_notifications).toBe(true);
                expect(result.data.service_health).toBe(true);
                expect(result.data.stuck_processing).toBe(true);
                expect(result.data.orphaned_pending).toBe(true);
                expect(result.data.ghost_delivery).toBe(false);
            }
        });
    });

    describe('adminChannelSchema', () => {
        it('should validate valid admin channel', () => {
            const validChannel = {
                channel_type: 'discord',
                name: 'Production Alerts',
                enabled: true,
                config: {
                    encrypted_data: 'data',
                    iv: 'iv',
                    auth_tag: 'tag',
                },
                alert_filters: {
                    failed_notifications: true,
                    service_health: true,
                    stuck_processing: true,
                    orphaned_pending: true,
                    ghost_delivery: false,
                },
            };

            const result = adminChannelSchema.safeParse(validChannel);
            expect(result.success).toBe(true);
        });

        it('should fail for invalid channel type', () => {
            const invalidChannel = {
                channel_type: 'invalid_channel',
                name: 'Test',
                enabled: true,
                config: { encrypted_data: 'd', iv: 'i', auth_tag: 't' },
                alert_filters: {},
            };

            const result = adminChannelSchema.safeParse(invalidChannel);
            expect(result.success).toBe(false);
        });

        it('should fail for empty name', () => {
            const invalidChannel = {
                channel_type: 'discord',
                name: '',
                enabled: true,
                config: { encrypted_data: 'd', iv: 'i', auth_tag: 't' },
                alert_filters: {},
            };

            const result = adminChannelSchema.safeParse(invalidChannel);
            expect(result.success).toBe(false);
        });

        it('should fail for name exceeding 100 characters', () => {
            const invalidChannel = {
                channel_type: 'discord',
                name: 'a'.repeat(101),
                enabled: true,
                config: { encrypted_data: 'd', iv: 'i', auth_tag: 't' },
                alert_filters: {},
            };

            const result = adminChannelSchema.safeParse(invalidChannel);
            expect(result.success).toBe(false);
        });
    });

    describe('systemConfigSchema', () => {
        it('should validate valid system config', () => {
            const validConfig = {
                key: 'admin_alert_encryption_key',
                value: 'abc123def456',
            };

            const result = systemConfigSchema.safeParse(validConfig);
            expect(result.success).toBe(true);
        });

        it('should fail for missing key', () => {
            const invalidConfig = {
                value: 'something',
            };

            const result = systemConfigSchema.safeParse(invalidConfig);
            expect(result.success).toBe(false);
        });
    });

    describe('discordConfigSchema', () => {
        it('should validate valid Discord webhook URL', () => {
            const validConfig = {
                webhook_url: 'https://discord.com/api/webhooks/1234567890/abcdefg',
            };

            const result = discordConfigSchema.safeParse(validConfig);
            expect(result.success).toBe(true);
        });

        it('should fail for non-Discord URL', () => {
            const invalidConfig = {
                webhook_url: 'https://example.com/webhook',
            };

            const result = discordConfigSchema.safeParse(invalidConfig);
            expect(result.success).toBe(false);
        });

        it('should fail for invalid URL format', () => {
            const invalidConfig = {
                webhook_url: 'not-a-url',
            };

            const result = discordConfigSchema.safeParse(invalidConfig);
            expect(result.success).toBe(false);
        });

        it('should fail for Discord URL with wrong path', () => {
            const invalidConfig = {
                webhook_url: 'https://discord.com/channels/123456',
            };

            const result = discordConfigSchema.safeParse(invalidConfig);
            expect(result.success).toBe(false);
        });
    });
});
