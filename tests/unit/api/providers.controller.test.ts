/**
 * Unit Tests for Providers Controller Rate Limits Endpoints
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mockGetAllProvidersRateLimitStatus = vi.fn();
const mockGetProviderRateLimitStatus = vi.fn();
const mockResetRateLimiter = vi.fn();

vi.mock('../../../src/processors/shared/rate-limiter.js', () => ({
    getAllProvidersRateLimitStatus: () => mockGetAllProvidersRateLimitStatus(),
    getProviderRateLimitStatus: (id: string) => mockGetProviderRateLimitStatus(id),
    resetRateLimiter: (id: string) => mockResetRateLimiter(id),
}));

describe('Providers Controller - Rate Limits Endpoints', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let jsonMock: ReturnType<typeof vi.fn>;
    let statusMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        jsonMock = vi.fn();
        statusMock = vi.fn().mockReturnThis();

        mockReq = {
            params: {},
        };
        mockRes = {
            json: jsonMock,
            status: statusMock,
        };
    });

    describe('getProvidersRateLimits', () => {
        it('should return 200 with all providers rate limit statuses', async () => {
            const { getProvidersRateLimits } = await import(
                '../../../src/api/controllers/providers.controller.js'
            );

            const mockData = {
                providers: [
                    {
                        provider_id: 'gmail-1',
                        channel: 'email',
                        plugin_name: 'nodemailer-gmail',
                        enabled: true,
                        config: { max_tokens: 100, refill_rate: 10, refill_interval: 'second', normalized_refill_rate: 10 },
                        status: {
                            remaining_tokens: 85,
                            used_tokens: 15,
                            usage_percentage: 15,
                            is_exhausted: false,
                            resets_in_ms: 0,
                            full_refill_in_ms: 1500,
                            last_refill_at: new Date(),
                            last_exhausted_at: null,
                            exhausted_count: 0,
                        },
                    },
                ],
                summary: {
                    total_providers: 1,
                    exhausted_providers: 0,
                    healthy_providers: 1,
                },
            };

            mockGetAllProvidersRateLimitStatus.mockResolvedValue(mockData);

            await getProvidersRateLimits(mockReq as Request, mockRes as Response);

            expect(jsonMock).toHaveBeenCalledWith(mockData);
        });

        it('should return 500 when retrieval fails', async () => {
            const { getProvidersRateLimits } = await import(
                '../../../src/api/controllers/providers.controller.js'
            );

            mockGetAllProvidersRateLimitStatus.mockRejectedValue(new Error('Redis connection failed'));

            await getProvidersRateLimits(mockReq as Request, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(500);
            expect(jsonMock).toHaveBeenCalledWith({
                error: 'Internal server error',
                message: 'Failed to retrieve providers rate limits',
            });
        });
    });

    describe('getProviderRateLimit', () => {
        it('should return 200 with specific provider rate limit', async () => {
            const { getProviderRateLimit } = await import(
                '../../../src/api/controllers/providers.controller.js'
            );

            mockReq.params = { id: 'gmail-1' };

            const mockSingle = {
                provider_id: 'gmail-1',
                channel: 'email',
                plugin_name: 'nodemailer-gmail',
                enabled: true,
                config: { max_tokens: 100, refill_rate: 10, refill_interval: 'second', normalized_refill_rate: 10 },
                status: {
                    remaining_tokens: 90,
                    used_tokens: 10,
                    usage_percentage: 10,
                    is_exhausted: false,
                    resets_in_ms: 0,
                    full_refill_in_ms: 1000,
                    last_refill_at: new Date(),
                    last_exhausted_at: null,
                    exhausted_count: 0,
                },
            };

            mockGetProviderRateLimitStatus.mockResolvedValue(mockSingle);

            await getProviderRateLimit(mockReq as Request, mockRes as Response);

            expect(jsonMock).toHaveBeenCalledWith({ rate_limit: mockSingle });
        });

        it('should return 404 if provider rate limit status is not found', async () => {
            const { getProviderRateLimit } = await import(
                '../../../src/api/controllers/providers.controller.js'
            );

            mockReq.params = { id: 'unknown-provider' };
            mockGetProviderRateLimitStatus.mockResolvedValue(null);

            await getProviderRateLimit(mockReq as Request, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(404);
            expect(jsonMock).toHaveBeenCalledWith({
                error: 'Not Found',
                message: "Provider 'unknown-provider' rate limit status not found",
            });
        });
    });

    describe('resetProviderRateLimit', () => {
        it('should call resetRateLimiter and return success message', async () => {
            const { resetProviderRateLimit } = await import(
                '../../../src/api/controllers/providers.controller.js'
            );

            mockReq.params = { id: 'gmail-1' };
            mockResetRateLimiter.mockResolvedValue(undefined);

            await resetProviderRateLimit(mockReq as Request, mockRes as Response);

            expect(mockResetRateLimiter).toHaveBeenCalledWith('gmail-1');
            expect(jsonMock).toHaveBeenCalledWith({
                message: "Rate limit for provider 'gmail-1' has been reset successfully.",
            });
        });
    });
});
