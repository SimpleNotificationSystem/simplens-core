import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageService } from '@src/storage/storage.service.js';
import { registerStorageProvider, clearStorageRegistry } from '@src/storage/storage-registry.js';
import file_attachment_model from '@src/database/models/file-attachment.models.js';
import storage_provider_model from '@src/database/models/storage-provider.models.js';
import { getOrCreateEncryptionKey } from '@src/admin-alerts/key-manager.js';
import { encrypt } from '@src/utils/encryption.utils.js';
import type { StorageProvider } from '@src/types/types.js';

vi.mock('../../../src/database/models/file-attachment.models.js');
vi.mock('@src/database/models/storage-provider.models.js');
vi.mock('@src/database/models/upload-lock.models.js');
vi.mock('@src/admin-alerts/key-manager.js');

describe('Storage Service', () => {
    const mockKey = Buffer.from('01234567890123456789012345678901');

    beforeEach(() => {
        vi.clearAllMocks();
        clearStorageRegistry();
        vi.mocked(file_attachment_model.findOne).mockReturnValue({
            lean: vi.fn().mockResolvedValue(null),
        } as never);
    });

    describe('computeHash', () => {
        it('should generate consistent SHA-256 hashes for identical buffers', () => {
            const buf1 = Buffer.from('hello world SimpleNS attachment');
            const buf2 = Buffer.from('hello world SimpleNS attachment');

            const hash1 = StorageService.computeHash(buf1);
            const hash2 = StorageService.computeHash(buf2);

            expect(hash1).toBe(hash2);
            expect(hash1).toHaveLength(64); // SHA-256 hex string length
        });

        it('should generate different hashes for distinct content', () => {
            const buf1 = Buffer.from('content A');
            const buf2 = Buffer.from('content B');

            const hash1 = StorageService.computeHash(buf1);
            const hash2 = StorageService.computeHash(buf2);

            expect(hash1).not.toBe(hash2);
        });
    });

    describe('getActiveProvider', () => {
        it('should return null when no active provider in database', async () => {
            vi.mocked(storage_provider_model.findOne).mockResolvedValue(null as never);

            const active = await StorageService.getActiveProvider();
            expect(active).toBeNull();
        });

        it('should return null if active provider in database is not registered in registry', async () => {
            vi.mocked(storage_provider_model.findOne).mockResolvedValue({
                provider_type: 'unknown_type',
                is_active: true,
                enabled: true,
            } as never);

            const active = await StorageService.getActiveProvider();
            expect(active).toBeNull();
        });

        it('should decrypt and return active provider when registered', async () => {

            vi.mocked(getOrCreateEncryptionKey).mockResolvedValue(mockKey);

            const rawConfig = { bucket: 'attachments-bucket' };
            const encryptedConfig = encrypt(JSON.stringify(rawConfig), mockKey);

            vi.mocked(storage_provider_model.findOne).mockResolvedValue({
                _id: 'provider-1',
                name: 'Main S3',
                provider_type: 's3',
                is_active: true,
                enabled: true,
                config: encryptedConfig,
            } as never);

            const mockProvider: StorageProvider = {
                providerType: 's3',
                displayName: 'S3 Provider',
                upload: vi.fn().mockResolvedValue({ success: true, fileId: 'f1' }),
                download: vi.fn().mockResolvedValue({ success: true }),
                delete: vi.fn().mockResolvedValue({ success: true }),
                exists: vi.fn().mockResolvedValue(true),
                testConnection: vi.fn().mockResolvedValue({ success: true }),
                getCredentialSchema: vi.fn().mockReturnValue([]),
            };

            registerStorageProvider('s3', () => mockProvider);

            const active = await StorageService.getActiveProvider();
            expect(active).not.toBeNull();
            expect(active?.provider.providerType).toBe('s3');
            expect(active?.doc.name).toBe('Main S3');
        });
    });

    describe('saveFile', () => {
        it('should compute hash and save file with active provider delegation', async () => {

            vi.mocked(getOrCreateEncryptionKey).mockResolvedValue(mockKey);

            const rawConfig = { bucket: 'attachments-bucket' };
            const encryptedConfig = encrypt(JSON.stringify(rawConfig), mockKey);

            vi.mocked(storage_provider_model.findOne).mockResolvedValue({
                _id: 'provider-1',
                name: 'Main S3',
                provider_type: 's3',
                is_active: true,
                enabled: true,
                config: encryptedConfig,
            } as never);

            const mockUpload = vi.fn().mockResolvedValue({
                success: true,
                fileId: 'file-uuid-1',
                storageKey: 's3/path/file-uuid-1.pdf',
                url: 'https://storage.example.com/file.pdf',
            });

            const mockProvider: StorageProvider = {
                providerType: 's3',
                displayName: 'S3 Provider',
                upload: mockUpload,
                download: vi.fn().mockResolvedValue({ success: true }),
                delete: vi.fn().mockResolvedValue({ success: true }),
                exists: vi.fn().mockResolvedValue(true),
                testConnection: vi.fn().mockResolvedValue({ success: true }),
                getCredentialSchema: vi.fn().mockReturnValue([]),
            };

            registerStorageProvider('s3', () => mockProvider);

            const mockCreatedDoc = {
                toObject: () => ({
                    file_id: 'generated-uuid',
                    filename: 'report.pdf',
                    mime_type: 'application/pdf',
                    size: 1024,
                    hash: 'dummyhash',
                    storage_provider: 's3',
                    storage_key: 's3/path/file-uuid-1.pdf',
                    url: 'https://storage.example.com/file.pdf',
                }),
            };
            vi.mocked(file_attachment_model.create).mockResolvedValue(mockCreatedDoc as never);

            const result = await StorageService.saveFile({
                originalname: 'report.pdf',
                mimetype: 'application/pdf',
                size: 1024,
                buffer: Buffer.from('PDF Content Data'),
            });

            expect(mockUpload).toHaveBeenCalledOnce();
            expect(result.filename).toBe('report.pdf');
            expect(result.storage_provider).toBe('s3');
            expect(result.url).toBe('https://storage.example.com/file.pdf');
        });

        it('should return existing file attachment without re-uploading if duplicate hash exists', async () => {

            vi.mocked(getOrCreateEncryptionKey).mockResolvedValue(mockKey);

            const rawConfig = { bucket: 'attachments-bucket' };
            const encryptedConfig = encrypt(JSON.stringify(rawConfig), mockKey);

            vi.mocked(storage_provider_model.findOne).mockResolvedValue({
                _id: 'provider-1',
                name: 'Main S3',
                provider_type: 's3',
                is_active: true,
                enabled: true,
                config: encryptedConfig,
            } as never);

            const mockUpload = vi.fn();
            const mockProvider: StorageProvider = {
                providerType: 's3',
                displayName: 'S3 Provider',
                upload: mockUpload,
                download: vi.fn(),
                delete: vi.fn(),
                exists: vi.fn(),
                getUrl: vi.fn(),
                testConnection: vi.fn(),
                getCredentialSchema: vi.fn().mockReturnValue([]),
            };

            registerStorageProvider('s3', () => mockProvider);

            const existingDoc = {
                file_id: 'existing-uuid-123',
                filename: 'report.pdf',
                mime_type: 'application/pdf',
                size: 1024,
                hash: StorageService.computeHash(Buffer.from('PDF Content Data')),
                storage_provider: 's3',
                storage_key: 's3/path/existing.pdf',
                url: 'https://storage.example.com/existing.pdf',
            };

            vi.mocked(file_attachment_model.findOne).mockReturnValue({
                lean: vi.fn().mockResolvedValue(existingDoc),
            } as never);

            const result = await StorageService.saveFile({
                originalname: 'report.pdf',
                mimetype: 'application/pdf',
                size: 1024,
                buffer: Buffer.from('PDF Content Data'),
            });

            expect(mockUpload).not.toHaveBeenCalled();
            expect(result.file_id).toBe('existing-uuid-123');
        });

        it('should clean up newly streamed file from storage when post-upload duplicate is detected', async () => {
            const { Readable } = await import('stream');

            vi.mocked(getOrCreateEncryptionKey).mockResolvedValue(mockKey);

            const rawConfig = { bucket: 'attachments-bucket' };
            const encryptedConfig = encrypt(JSON.stringify(rawConfig), mockKey);

            vi.mocked(storage_provider_model.findOne).mockResolvedValue({
                _id: 'provider-1',
                name: 'Main S3',
                provider_type: 's3',
                is_active: true,
                enabled: true,
                config: encryptedConfig,
            } as never);

            const mockDelete = vi.fn().mockResolvedValue({ success: true });
            const mockUpload = vi.fn().mockResolvedValue({
                success: true,
                storageKey: 'attachments/transient-file-uuid',
                size: 15,
            });

            const mockProvider: StorageProvider = {
                providerType: 's3',
                displayName: 'S3 Provider',
                upload: mockUpload,
                download: vi.fn(),
                delete: mockDelete,
                exists: vi.fn(),
                getUrl: vi.fn(),
                testConnection: vi.fn(),
                getCredentialSchema: vi.fn().mockReturnValue([]),
            };

            registerStorageProvider('s3', () => mockProvider);

            const existingDoc = {
                file_id: 'canonical-doc-id-999',
                filename: 'streamed.pdf',
                mime_type: 'application/pdf',
                size: 15,
                hash: 'somehash',
                storage_provider: 's3',
                storage_key: 'attachments/canonical-doc-id-999',
                url: 'https://storage.example.com/canonical.pdf',
            };

            // First findOne (fast-path) is skipped because stream has no hash.
            // Post-upload duplicateQuery finds existingDoc.
            vi.mocked(file_attachment_model.findOne).mockReturnValue({
                lean: vi.fn().mockResolvedValue(existingDoc),
            } as never);

            const result = await StorageService.saveFile({
                originalname: 'streamed.pdf',
                mimetype: 'application/pdf',
                stream: Readable.from([Buffer.from('stream data 123')]),
            });

            expect(mockUpload).toHaveBeenCalledOnce();
            // Verify that mockDelete was called to clean up the redundant transient upload
            expect(mockDelete).toHaveBeenCalledWith(
                expect.any(String),
                'attachments/transient-file-uuid'
            );
            expect(result.file_id).toBe('canonical-doc-id-999');
        });

        it('should throw error when active provider upload fails', async () => {

            vi.mocked(getOrCreateEncryptionKey).mockResolvedValue(mockKey);

            const rawConfig = { bucket: 'attachments-bucket' };
            const encryptedConfig = encrypt(JSON.stringify(rawConfig), mockKey);

            vi.mocked(storage_provider_model.findOne).mockResolvedValue({
                _id: 'provider-1',
                name: 'Main S3',
                provider_type: 's3',
                is_active: true,
                enabled: true,
                config: encryptedConfig,
            } as never);

            const mockProvider: StorageProvider = {
                providerType: 's3',
                displayName: 'S3 Provider',
                upload: vi.fn().mockResolvedValue({
                    success: false,
                    error: 'S3 Access Denied: Bucket does not exist',
                }),
                download: vi.fn().mockResolvedValue({ success: true }),
                delete: vi.fn().mockResolvedValue({ success: true }),
                exists: vi.fn().mockResolvedValue(true),
                testConnection: vi.fn().mockResolvedValue({ success: true }),
                getCredentialSchema: vi.fn().mockReturnValue([]),
            };

            registerStorageProvider('s3', () => mockProvider);

            await expect(
                StorageService.saveFile({
                    originalname: 'report.pdf',
                    mimetype: 'application/pdf',
                    size: 1024,
                    buffer: Buffer.from('PDF Content Data'),
                })
            ).rejects.toThrow('S3 Access Denied: Bucket does not exist');
        });
    });

    describe('getFileMetadata & downloadFile & deleteFile', () => {
        it('should fetch file metadata by file_id', async () => {
            vi.mocked(file_attachment_model.findOne).mockReturnValue({
                lean: vi.fn().mockResolvedValue({
                    file_id: 'test-file-id',
                    filename: 'invoice.pdf',
                    mime_type: 'application/pdf',
                    size: 2048,
                    hash: 'abc123hash',
                }),
            } as never);

            const meta = await StorageService.getFileMetadata('test-file-id');
            expect(meta).not.toBeNull();
            expect(meta?.filename).toBe('invoice.pdf');
        });

        it('should delete file and remove record', async () => {
            vi.mocked(file_attachment_model.findOne).mockReturnValue({
                lean: vi.fn().mockResolvedValue({
                    file_id: 'test-file-id',
                    filename: 'invoice.pdf',
                }),
            } as never);
            vi.mocked(file_attachment_model.deleteOne).mockResolvedValue({ deletedCount: 1 } as never);
            vi.mocked(storage_provider_model.findOne).mockResolvedValue(null as never);

            const deleted = await StorageService.deleteFile('test-file-id');
            expect(deleted).toBe(true);
            expect(file_attachment_model.deleteOne).toHaveBeenCalledWith({ file_id: 'test-file-id' });
        });

        it('should delete file using the inactive provider when attachment matches it', async () => {

            vi.mocked(getOrCreateEncryptionKey).mockResolvedValue(mockKey);

            const rawConfig = { bucket: 'minio-old-bucket' };
            const encryptedConfig = encrypt(JSON.stringify(rawConfig), mockKey);

            // Active provider is s3
            const activeS3Doc = {
                _id: 'provider-s3',
                name: 'Active S3',
                provider_type: 's3',
                is_active: true,
                enabled: true,
                config: encryptedConfig,
            };

            // Inactive provider is minio
            const inactiveMinioDoc = {
                _id: 'provider-minio',
                name: 'Old MinIO',
                provider_type: 'minio',
                is_active: false,
                enabled: true,
                config: encryptedConfig,
            };

            vi.mocked(storage_provider_model.findOne).mockImplementation(((query: any) => {
                if (query?.is_active === true) return Promise.resolve(activeS3Doc);
                if (query?.provider_type === 'minio') return Promise.resolve(inactiveMinioDoc);
                return Promise.resolve(null);
            }) as never);

            const mockMinioDelete = vi.fn().mockResolvedValue({ success: true });
            const mockMinioProvider: StorageProvider = {
                providerType: 'minio',
                displayName: 'MinIO Provider',
                upload: vi.fn(),
                download: vi.fn(),
                delete: mockMinioDelete,
                exists: vi.fn(),
                testConnection: vi.fn(),
                getCredentialSchema: vi.fn().mockReturnValue([]),
            };

            registerStorageProvider('minio', () => mockMinioProvider);

            vi.mocked(file_attachment_model.findOne).mockReturnValue({
                lean: vi.fn().mockResolvedValue({
                    file_id: 'minio-file-id',
                    filename: 'archive.pdf',
                    storage_provider: 'minio',
                    storage_key: 'attachments/archive.pdf',
                }),
            } as never);
            vi.mocked(file_attachment_model.deleteOne).mockResolvedValue({ deletedCount: 1 } as never);

            const deleted = await StorageService.deleteFile('minio-file-id');
            expect(deleted).toBe(true);
            expect(mockMinioDelete).toHaveBeenCalledWith('minio-file-id', 'attachments/archive.pdf');
            expect(file_attachment_model.deleteOne).toHaveBeenCalledWith({ file_id: 'minio-file-id' });
        });

        it('should resolve and delete file using specific storage_provider_id when multiple providers of same type exist', async () => {

            vi.mocked(getOrCreateEncryptionKey).mockResolvedValue(mockKey);

            const rawConfigA = { bucket: 'minio-bucket-a' };
            const encryptedConfigA = encrypt(JSON.stringify(rawConfigA), mockKey);
            const rawConfigB = { bucket: 'minio-bucket-b' };
            const encryptedConfigB = encrypt(JSON.stringify(rawConfigB), mockKey);

            const minioDocA = {
                _id: 'provider-minio-a',
                name: 'MinIO Alpha',
                provider_type: 'minio',
                is_active: true,
                enabled: true,
                config: encryptedConfigA,
            };

            const minioDocB = {
                _id: 'provider-minio-b',
                name: 'MinIO Beta',
                provider_type: 'minio',
                is_active: false,
                enabled: true,
                config: encryptedConfigB,
            };

            vi.mocked(storage_provider_model.findById).mockImplementation(((id: string) => {
                if (id === 'provider-minio-b') return Promise.resolve(minioDocB);
                if (id === 'provider-minio-a') return Promise.resolve(minioDocA);
                return Promise.resolve(null);
            }) as never);

            const mockDeleteB = vi.fn().mockResolvedValue({ success: true });
            const mockFactory = (config: any) => ({
                providerType: 'minio',
                displayName: 'MinIO Provider',
                upload: vi.fn(),
                download: vi.fn(),
                delete: config?.bucket === 'minio-bucket-b' ? mockDeleteB : vi.fn(),
                exists: vi.fn(),
                testConnection: vi.fn(),
                getCredentialSchema: vi.fn().mockReturnValue([]),
            });

            registerStorageProvider('minio', mockFactory as never);

            vi.mocked(file_attachment_model.findOne).mockReturnValue({
                lean: vi.fn().mockResolvedValue({
                    file_id: 'file-on-beta',
                    filename: 'beta.pdf',
                    storage_provider: 'minio',
                    storage_provider_id: 'provider-minio-b',
                    storage_key: 'attachments/beta.pdf',
                }),
            } as never);
            vi.mocked(file_attachment_model.deleteOne).mockResolvedValue({ deletedCount: 1 } as never);

            const deleted = await StorageService.deleteFile('file-on-beta');
            expect(deleted).toBe(true);
            expect(mockDeleteB).toHaveBeenCalledWith('file-on-beta', 'attachments/beta.pdf');
            expect(file_attachment_model.deleteOne).toHaveBeenCalledWith({ file_id: 'file-on-beta' });
        });

        it('should throw and NOT delete MongoDB record when storage provider deletion fails', async () => {

            vi.mocked(getOrCreateEncryptionKey).mockResolvedValue(mockKey);

            const rawConfig = { bucket: 's3-bucket' };
            const encryptedConfig = encrypt(JSON.stringify(rawConfig), mockKey);

            const activeS3Doc = {
                _id: 'provider-s3',
                name: 'Active S3',
                provider_type: 's3',
                is_active: true,
                enabled: true,
                config: encryptedConfig,
            };

            vi.mocked(storage_provider_model.findOne).mockResolvedValue(activeS3Doc as never);

            const mockS3Delete = vi.fn().mockResolvedValue({
                success: false,
                error: 'S3 500 Internal Server Error',
            });
            const mockS3Provider: StorageProvider = {
                providerType: 's3',
                displayName: 'S3 Provider',
                upload: vi.fn(),
                download: vi.fn(),
                delete: mockS3Delete,
                exists: vi.fn(),
                testConnection: vi.fn(),
                getCredentialSchema: vi.fn().mockReturnValue([]),
            };

            registerStorageProvider('s3', () => mockS3Provider);

            vi.mocked(file_attachment_model.findOne).mockReturnValue({
                lean: vi.fn().mockResolvedValue({
                    file_id: 's3-file-id',
                    filename: 'doc.pdf',
                    storage_provider: 's3',
                    storage_key: 'attachments/doc.pdf',
                }),
            } as never);

            await expect(StorageService.deleteFile('s3-file-id')).rejects.toThrow(
                'Failed to delete file \'s3-file-id\' from storage provider \'Active S3\': S3 500 Internal Server Error'
            );
            expect(file_attachment_model.deleteOne).not.toHaveBeenCalled();
        });

        it('should download file from inactive provider when attachment matches it', async () => {

            vi.mocked(getOrCreateEncryptionKey).mockResolvedValue(mockKey);

            const rawConfig = { bucket: 'gcs-bucket' };
            const encryptedConfig = encrypt(JSON.stringify(rawConfig), mockKey);

            const inactiveGcsDoc = {
                _id: 'provider-gcs',
                name: 'GCS Storage',
                provider_type: 'gcs',
                is_active: false,
                enabled: true,
                config: encryptedConfig,
            };

            vi.mocked(storage_provider_model.findOne).mockImplementation(((query: any) => {
                if (query?.is_active === true) return Promise.resolve(null);
                if (query?.provider_type === 'gcs') return Promise.resolve(inactiveGcsDoc);
                return Promise.resolve(null);
            }) as never);

            const mockGcsDownload = vi.fn().mockResolvedValue({
                success: true,
                buffer: Buffer.from('GCS File Content'),
            });
            const mockGcsProvider: StorageProvider = {
                providerType: 'gcs',
                displayName: 'GCS Provider',
                upload: vi.fn(),
                download: mockGcsDownload,
                delete: vi.fn(),
                exists: vi.fn(),
                testConnection: vi.fn(),
                getCredentialSchema: vi.fn().mockReturnValue([]),
            };

            registerStorageProvider('gcs', () => mockGcsProvider);

            const fileDoc = {
                file_id: 'gcs-file-id',
                filename: 'photo.png',
                storage_provider: 'gcs',
                storage_key: 'attachments/photo.png',
            };

            vi.mocked(file_attachment_model.findOne).mockReturnValue({
                lean: vi.fn().mockResolvedValue(fileDoc),
            } as never);

            const result = await StorageService.downloadFile('gcs-file-id');
            expect(result.download.success).toBe(true);
            expect(mockGcsDownload).toHaveBeenCalledWith('gcs-file-id', 'attachments/photo.png');
        });
    });
});
