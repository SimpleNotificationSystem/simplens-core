/**
 * Channel Provider Registry
 * Extensible pattern - new channels register themselves here
 */

import type { AdminChannelProvider, CredentialField } from './admin-channel.interface.js';
import type { AdminChannelType } from '@src/types/types.js';

/**
 * Factory function type for creating channel provider instances
 */
type ProviderFactory = (config: unknown) => AdminChannelProvider;

/**
 * Registry of channel providers
 * Maps channel types to their factory functions
 */
const providerRegistry = new Map<AdminChannelType, ProviderFactory>();

/**
 * Register a channel provider factory
 * Called by channel implementations on module load
 * @param channelType - The type of channel (e.g., 'discord', 'telegram')
 * @param factory - Factory function that creates provider instances
 */
export function registerChannelProvider(
    channelType: AdminChannelType,
    factory: ProviderFactory
): void {
    providerRegistry.set(channelType, factory);
}

/**
 * Get a provider instance for a channel type
 * @param channelType - The type of channel
 * @param config - Configuration for the provider (decrypted)
 * @returns Provider instance
 * @throws Error if no provider is registered for the channel type
 */
export function getChannelProvider(
    channelType: AdminChannelType,
    config: unknown
): AdminChannelProvider {
    const factory = providerRegistry.get(channelType);
    if (!factory) {
        throw new Error(`No provider registered for channel type: ${channelType}`);
    }
    return factory(config);
}

/**
 * Check if a channel type has a registered provider
 * @param channelType - The type of channel to check
 */
export function hasChannelProvider(channelType: AdminChannelType): boolean {
    return providerRegistry.has(channelType);
}

/**
 * Get all registered channel types
 * @returns Array of registered channel type strings
 */
export function getRegisteredChannelTypes(): AdminChannelType[] {
    return Array.from(providerRegistry.keys());
}

/**
 * Admin channel metadata for dashboard
 */
export interface AdminChannelMeta {
    channelType: AdminChannelType;
    displayName: string;
    credentialFields: CredentialField[];
}

/**
 * Get metadata for all registered admin channel providers
 * Used by dashboard for dynamic form generation
 * @returns Array of provider metadata
 */
export function getAdminChannelMetadata(): AdminChannelMeta[] {
    const metadata: AdminChannelMeta[] = [];
    
    for (const [channelType, factory] of providerRegistry.entries()) {
        // Create a temporary instance to get metadata
        // Using empty config since we only need schema info
        try {
            // Pass empty config to factory - factory must handle this gracefully
            const provider = factory({});
            metadata.push({
                channelType,
                displayName: provider.displayName,
                credentialFields: provider.getCredentialSchema(),
            });
        } catch (err) {
            // Skip providers that fail to instantiate with empty config
            console.error(`Failed to get metadata for channel '${channelType}':`, err);
        }
    }
    
    return metadata;
}

