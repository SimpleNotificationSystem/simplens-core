import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageService } from '@src/storage/storage.service.js';
import { registerStorageProvider, clearStorageRegistry } from '@src/storage/storage-registry.js';
import file_attachment_model from '@src/database/models/file-attachment.models.js';
import storage_provider_model from '@src/database/models/storage-provider.models.js';
import { getOrCreateEncryptionKey } from '@src/admin-alerts/key-manager.js';
import { encrypt } from '@src/utils/encryption.utils.js';
import type { StorageProvider } from '@src/types/types.js';

vi.mock('@src/database/models/file-attachment.models.js');
vi.mock('@src/database/models/storage-provider.models.js');
vi.mock('@src/admin-alerts/key-manager.js');

describe('Storage Service', () => {
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
            const mockKey = '01234567890123456789012345678901';
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
            const mockKey = '01234567890123456789012345678901';
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
            const mockKey = '01234567890123456789012345678901';
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

        it('should throw error when active provider upload fails', async () => {
            const mockKey = '01234567890123456789012345678901';
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
    });
});
