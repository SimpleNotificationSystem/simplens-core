/**
 * Provider contracts are owned by the shared type module. These exports keep
 * the existing plugin import path compatible with external providers.
 */
export type {
    BaseNotification,
    DeliveryResult,
    ProviderConfig,
    ProviderManifest,
    RateLimitConfig,
    SimpleNSProvider,
} from '@src/types/types.js';
