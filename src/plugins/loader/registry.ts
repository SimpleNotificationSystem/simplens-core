/**
 * Plugin Registry
 * 
 * Central registry for all loaded notification providers.
 * Handles provider lookup by ID or channel.
 */

import type { SimpleNSProvider, ProviderManifest } from '../interfaces/provider.types.js';

/**
 * Registered provider with configuration
 */
export interface RegisteredProvider {
    provider: SimpleNSProvider;
    id: string;
    priority: number;
}

/**
 * Channel configuration
 */
export interface ChannelConfig {
    default: string;
    fallback?: string;
}

/**
 * Field definition for dynamic form generation
 */
export interface FieldDefinition {
    name: string;
    type: 'string' | 'email' | 'phone' | 'text' | 'number' | 'boolean';
    required: boolean;
    description?: string;
}

/**
 * Provider metadata for dashboard
 */
export interface ProviderMetadata {
    id: string;
    name: string;
    displayName: string;
    description?: string;
    priority: number;
    recipientFields: FieldDefinition[];
    contentFields: FieldDefinition[];
}

/**
 * Channel metadata for dashboard
 */
export interface ChannelMetadata {
    providers: ProviderMetadata[];
    default?: string;
    fallback?: string;
}

/**
 * Full plugin metadata response
 */
export interface PluginMetadata {
    channels: Record<string, ChannelMetadata>;
}

/**
 * Extract field definitions from a Zod object schema
 */
function extractFieldsFromSchema(schema: { shape?: Record<string, unknown> }): FieldDefinition[] {
    const fields: FieldDefinition[] = [];

    if (!schema.shape) {
        return fields;
    }

    for (const [name, fieldSchema] of Object.entries(schema.shape)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const zodSchema = fieldSchema as any;

        let type: FieldDefinition['type'] = 'string';
        let required = true;

        // Check if optional
        if (zodSchema._def?.typeName === 'ZodOptional') {
            required = false;
        }

        // Get the inner type (unwrap optional/nullable)
        let innerSchema = zodSchema;
        while (innerSchema._def?.innerType) {
            innerSchema = innerSchema._def.innerType;
        }

        // Detect type from Zod schema
        const typeName = innerSchema._def?.typeName;
        const checks = innerSchema._def?.checks || [];

        if (typeName === 'ZodNumber') {
            type = 'number';
        } else if (typeName === 'ZodBoolean') {
            type = 'boolean';
        } else if (typeName === 'ZodString') {
            // Check for email validation
            const hasEmail = checks.some((c: { kind: string }) => c.kind === 'email');
            if (hasEmail) {
                type = 'email';
            } else if (name.toLowerCase().includes('phone')) {
                type = 'phone';
            } else if (name.toLowerCase().includes('message') || name.toLowerCase().includes('body')) {
                type = 'text';
            } else {
                type = 'string';
            }
        }

        fields.push({
            name,
            type,
            required,
            description: zodSchema.description,
        });
    }

    return fields;
}

class PluginRegistryClass {
    private providers: Map<string, RegisteredProvider> = new Map();
    private channelProviders: Map<string, string[]> = new Map();
    private channelConfig: Map<string, ChannelConfig> = new Map();
    private initialized: boolean = false;

    /**
     * Register a provider
     */
    register(provider: SimpleNSProvider, id: string, priority: number = 0): void {
        if (this.providers.has(id)) {
            throw new Error(`Provider '${id}' is already registered`);
        }

        this.providers.set(id, { provider, id, priority });

        // Add to channel mapping
        const channel = provider.manifest.channel;
        const existing = this.channelProviders.get(channel) || [];
        existing.push(id);
        // Sort by priority (higher first)
        existing.sort((a, b) => {
            const prioA = this.providers.get(a)?.priority || 0;
            const prioB = this.providers.get(b)?.priority || 0;
            return prioB - prioA;
        });
        this.channelProviders.set(channel, existing);

        console.log(`[PluginRegistry] Registered provider: ${id} (${provider.manifest.displayName}) for channel: ${channel}`);
    }

    /**
     * Set channel configuration (default/fallback)
     */
    setChannelConfig(channel: string, config: ChannelConfig): void {
        this.channelConfig.set(channel, config);
    }

    /**
     * Get a provider by ID
     */
    get(id: string): SimpleNSProvider | undefined {
        return this.providers.get(id)?.provider;
    }

    /**
     * Get provider or throw error
     */
    getOrThrow(id: string): SimpleNSProvider {
        const provider = this.get(id);
        if (!provider) {
            throw new Error(`Provider '${id}' not found. Available: ${this.getProviderIds().join(', ')}`);
        }
        return provider;
    }

    /**
     * Get all providers for a channel (ordered by priority)
     */
    getProvidersForChannel(channel: string): SimpleNSProvider[] {
        const ids = this.channelProviders.get(channel) || [];
        return ids
            .map(id => this.get(id))
            .filter((p): p is SimpleNSProvider => p !== undefined);
    }

    /**
     * Get default provider for a channel
     */
    getDefaultProvider(channel: string): SimpleNSProvider | undefined {
        const config = this.channelConfig.get(channel);
        if (config?.default) {
            return this.get(config.default);
        }
        // Fall back to first registered provider for channel
        const providers = this.getProvidersForChannel(channel);
        return providers[0];
    }

    /**
     * Get fallback provider for a channel
     */
    getFallbackProvider(channel: string): SimpleNSProvider | undefined {
        const config = this.channelConfig.get(channel);
        if (config?.fallback) {
            return this.get(config.fallback);
        }
        // Fall back to second registered provider for channel
        const providers = this.getProvidersForChannel(channel);
        return providers[1];
    }

    /**
     * Get all registered provider IDs
     */
    getProviderIds(): string[] {
        return Array.from(this.providers.keys());
    }

    /**
     * Get all supported channels
     */
    getChannels(): string[] {
        return Array.from(this.channelProviders.keys());
    }

    /**
     * Get provider manifests
     */
    getManifests(): ProviderManifest[] {
        return Array.from(this.providers.values()).map(r => r.provider.manifest);
    }

    /**
     * Check if a provider is registered
     */
    has(id: string): boolean {
        return this.providers.has(id);
    }

    /**
     * Check if a channel has providers
     */
    hasChannel(channel: string): boolean {
        return this.channelProviders.has(channel) &&
            (this.channelProviders.get(channel)?.length || 0) > 0;
    }

    /**
     * Shutdown all providers
     */
    async shutdownAll(): Promise<void> {
        console.log(`[PluginRegistry] Shutting down ${this.providers.size} providers...`);
        for (const { provider, id } of this.providers.values()) {
            try {
                await provider.shutdown();
                console.log(`[PluginRegistry] Shutdown provider: ${id}`);
            } catch (err) {
                console.error(`[PluginRegistry] Error shutting down ${id}:`, err);
            }
        }
        this.providers.clear();
        this.channelProviders.clear();
        this.channelConfig.clear();
        this.initialized = false;
    }

    /**
     * Clear all providers (for testing)
     */
    clear(): void {
        this.providers.clear();
        this.channelProviders.clear();
        this.channelConfig.clear();
        this.initialized = false;
    }

    /**
     * Check if registry is initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Get plugin metadata for dashboard
     * Returns channels and their providers with schema info
     */
    getPluginMetadata(): PluginMetadata {
        const channels: Record<string, ChannelMetadata> = {};

        for (const [channel, providerIds] of this.channelProviders.entries()) {
            const providers: ProviderMetadata[] = [];

            for (const id of providerIds) {
                const registered = this.providers.get(id);
                if (!registered) continue;

                const provider = registered.provider;
                const manifest = provider.manifest;

                // Extract field definitions from schemas
                const recipientFields = extractFieldsFromSchema(provider.getRecipientSchema());
                const contentFields = extractFieldsFromSchema(provider.getContentSchema());

                providers.push({
                    id,
                    name: manifest.name,
                    displayName: manifest.displayName || manifest.name,
                    description: manifest.description,
                    priority: registered.priority,
                    recipientFields,
                    contentFields,
                });
            }

            const config = this.channelConfig.get(channel);
            channels[channel] = {
                providers,
                default: config?.default || providers[0]?.id,
                fallback: config?.fallback,
            };
        }

        return { channels };
    }

    /**
     * Mark as initialized
     */
    setInitialized(value: boolean): void {
        this.initialized = value;
    }
}

// Singleton instance
export const PluginRegistry = new PluginRegistryClass();
