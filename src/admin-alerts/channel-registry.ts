/**
 * Channel Provider Registry
 * Extensible pattern - new channels register themselves here
 */

import type { AdminChannelProvider } from './admin-channel.interface.js';
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
