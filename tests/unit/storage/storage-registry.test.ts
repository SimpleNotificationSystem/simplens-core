import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    registerStorageProvider,
    getStorageProvider,
    hasStorageProvider,
    getRegisteredStorageTypes,
    getStorageProviderMetadata,
    clearStorageRegistry,
} from '@src/storage/storage-registry.js';
import type { StorageProvider } from '@src/types/types.js';

describe('Storage Registry', () => {
    beforeEach(() => {
        clearStorageRegistry();
    });

    const createMockStorageProvider = (type: string, name: string): StorageProvider => ({
        providerType: type,
        displayName: name,
        upload: vi.fn().mockResolvedValue({ success: true, fileId: 'file-1' }),
        download: vi.fn().mockResolvedValue({ success: true, buffer: Buffer.from('test') }),
        delete: vi.fn().mockResolvedValue({ success: true }),
        exists: vi.fn().mockResolvedValue(true),
        testConnection: vi.fn().mockResolvedValue({ success: true }),
        getCredentialSchema: vi.fn().mockReturnValue([
            { name: 'bucket', type: 'string', label: 'Bucket Name', required: true },
            { name: 'apiKey', type: 'secret', label: 'API Key', required: true },
        ]),
    });

    it('should register and retrieve a storage provider factory', () => {
        registerStorageProvider('s3', (config) => ({
            ...createMockStorageProvider('s3', 'Amazon S3'),
            config,
        } as unknown as StorageProvider));

        expect(hasStorageProvider('s3')).toBe(true);
        expect(hasStorageProvider('minio')).toBe(false);

        const instance = getStorageProvider('s3', { bucket: 'my-bucket' });
        expect(instance).toBeDefined();
        expect(instance.providerType).toBe('s3');
        expect(instance.displayName).toBe('Amazon S3');
    });

    it('should throw error when requesting unregistered provider', () => {
        expect(() => getStorageProvider('non-existent', {})).toThrow(
            'No storage provider registered for type: non-existent'
        );
    });

    it('should list all registered storage types', () => {
        registerStorageProvider('local', () => createMockStorageProvider('local', 'Local Storage'));
        registerStorageProvider('minio', () => createMockStorageProvider('minio', 'MinIO'));

        const types = getRegisteredStorageTypes();
        expect(types).toEqual(['local', 'minio']);
    });

    it('should extract metadata and credential schemas for dashboard', () => {
        registerStorageProvider('s3', () => createMockStorageProvider('s3', 'AWS S3'));

        const metadata = getStorageProviderMetadata();
        expect(metadata).toHaveLength(1);
        expect(metadata[0]).toEqual({
            providerType: 's3',
            displayName: 'AWS S3',
            credentialFields: [
                { name: 'bucket', type: 'string', label: 'Bucket Name', required: true },
                { name: 'apiKey', type: 'secret', label: 'API Key', required: true },
            ],
        });
    });

    it('should clear registry on clearStorageRegistry()', () => {
        registerStorageProvider('s3', () => createMockStorageProvider('s3', 'AWS S3'));
        expect(hasStorageProvider('s3')).toBe(true);

        clearStorageRegistry();
        expect(hasStorageProvider('s3')).toBe(false);
        expect(getRegisteredStorageTypes()).toHaveLength(0);
    });
});
