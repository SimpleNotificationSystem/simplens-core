/**
 * simplens-sdk
 * 
 * SDK for building SimpleNS notification provider plugins.
 * 
 * SimpleNS is a notification management layer that handles:
 * - Rate limiting
 * - Retry with exponential backoff
 * - Idempotency
 * - Recovery
 * - Status tracking
 * - Webhook callbacks
 * 
 * Providers handle the actual delivery via external APIs.
 * 
 * @example
 * ```typescript
 * import { SimpleNSProvider, ProviderManifest, createNotificationSchema } from 'simplens-sdk';
 * 
 * class MyProvider implements SimpleNSProvider {
 *   readonly manifest: ProviderManifest = {
 *     name: '@simplens/my-provider',
 *     version: '1.0.0',
 *     channel: 'email',
 *     displayName: 'My Provider',
 *     description: 'Send notifications via My Service',
 *     author: 'Your Name',
 *     requiredCredentials: ['API_KEY'],
 *   };
 *   
 *   // ... implement interface methods
 * }
 * ```
 */

// Re-export zod for plugin developers
export { z } from 'zod';

// Interfaces
export type {
    SimpleNSProvider,
    ProviderManifest,
    ProviderConfig,
    RateLimitConfig,
    DeliveryResult,
    BaseNotification,
} from './interfaces/provider.interface.js';

// Schemas
export {
    baseRecipientSchema,
    baseNotificationSchema,
    emailRecipientSchema,
    smsRecipientSchema,
    whatsappRecipientSchema,
    pushRecipientSchema,
    emailContentSchema,
    smsContentSchema,
    whatsappContentSchema,
    createNotificationSchema,
} from './schemas/base.schemas.js';

// Utilities
export {
    replaceVariables,
    isHtmlContent,
    truncate,
    sleep,
    retryWithBackoff,
} from './utils/template.utils.js';
