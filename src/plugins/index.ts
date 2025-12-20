/**
 * Plugin System
 * 
 * Exports for loading and managing notification providers.
 */

// Registry
export {
    PluginRegistry,
    type RegisteredProvider,
    type ChannelConfig,
    type PluginMetadata,
    type ChannelMetadata,
    type ProviderMetadata,
    type FieldDefinition,
} from './loader/registry.js';

// Loader
export { loadProviders, loadProvidersFromEnv, registerProvider, getConfiguredChannels } from './loader/loader.js';

// Router
export { sendWithFallback, sendToProvider, validateNotification, getRateLimitConfig } from './loader/router.js';
