/**
 * Storage Provider Registry
 * Extensible registry pattern - storage providers register themselves here
 */

import type { StorageProvider, StorageProviderMeta } from '@src/types/types.js';

export type StorageProviderFactory = (config: unknown) => StorageProvider;

const storageRegistry = new Map<string, StorageProviderFactory>();

/**
 * Register a storage provider factory
 * @param providerType - Unique provider type identifier (e.g. 's3', 'minio', 'local')
 * @param factory - Factory function that creates provider instances
 */
export function registerStorageProvider(
    providerType: string,
    factory: StorageProviderFactory
): void {
    storageRegistry.set(providerType, factory);
}

/**
 * Get a provider instance for a storage type
 * @param providerType - Unique provider type identifier
 * @param config - Decrypted configuration for the provider
 * @returns Provider instance
 */
export function getStorageProvider(
    providerType: string,
    config: unknown
): StorageProvider {
    const factory = storageRegistry.get(providerType);
    if (!factory) {
        throw new Error(`No storage provider registered for type: ${providerType}`);
    }
    return factory(config);
}

/**
 * Check if a storage provider is registered
 */
export function hasStorageProvider(providerType: string): boolean {
    return storageRegistry.has(providerType);
}

/**
 * Get all registered storage provider types
 */
export function getRegisteredStorageTypes(): string[] {
    return Array.from(storageRegistry.keys());
}

/**
 * Get metadata and credential schemas for all registered storage providers
 * Used by dashboard for dynamic credential/env form generation
 */
export function getStorageProviderMetadata(): StorageProviderMeta[] {
    const metadata: StorageProviderMeta[] = [];

    for (const [providerType, factory] of storageRegistry.entries()) {
        try {
            const provider = factory({});
            metadata.push({
                providerType,
                displayName: provider.displayName,
                credentialFields: provider.getCredentialSchema(),
            });
        } catch (err) {
            console.error(`Failed to get metadata for storage provider '${providerType}':`, err);
        }
    }

    return metadata;
}

/**
 * Clear all registered storage providers (useful in test teardown)
 */
export function clearStorageRegistry(): void {
    storageRegistry.clear();
}
