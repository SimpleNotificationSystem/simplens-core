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
export {
    loadProviders,
    loadProvidersFromEnv,
    loadProvidersFromDatabase,
    getConfiguredChannels,
    registerProvider,
} from './loader/loader.js';

// Router
export {
    sendWithFallback,
    sendToProvider,
    validateNotification,
    validateNotificationForProvider,
    resolveFallbackProviderId,
    getRateLimitConfig
} from './loader/router.js';

// Dynamic Management Services
export { PluginManagerService } from './services/plugin-manager.service.js';
export { ProviderManagerService, type ProviderResponseDto } from './services/provider-manager.service.js';
export { ChannelRoutingService } from './services/channel-routing.service.js';
export { YamlMigrator } from './bootstrap/yaml-migrator.js';
export { PluginSyncService } from './sync/plugin-sync.service.js';
export { encryptCredentials, decryptCredentials } from './crypto/keypair-manager.js';
export {
    installNpmPackage,
    uninstallNpmPackage,
    extractPackageManifest,
    importAndInstantiateProvider,
} from './loader/plugin-fs.js';
