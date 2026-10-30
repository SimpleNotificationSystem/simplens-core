import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import file_router from '@src/api/routes/file.routes.js';
import storage_router from '@src/api/routes/storage.routes.js';
import storage_provider_model from '@src/database/models/storage-provider.models.js';
import file_attachment_model from '@src/database/models/file-attachment.models.js';
import {
    registerStorageProvider,
    clearStorageRegistry,
} from '@src/storage/storage-registry.js';
import { getOrCreateEncryptionKey } from '@src/admin-alerts/key-manager.js';
import { encrypt } from '@src/utils/encryption.utils.js';
import type { StorageProvider } from '@src/types/types.js';

vi.mock('@src/database/models/storage-provider.models.js');
vi.mock('@src/database/models/file-attachment.models.js');
vi.mock('@src/admin-alerts/key-manager.js');

describe('Storage & File Attachments API Integration', () => {
    let app: express.Application;
    const mockEncryptionKey = '01234567890123456789012345678901';

    const createMockProvider = (): StorageProvider => ({
        providerType: 's3',
        displayName: 'Amazon S3',
        upload: vi.fn().mockResolvedValue({
            success: true,
            fileId: 'mock-file-id',
            storageKey: 's3/path/test.pdf',
            url: 'https://s3.example.com/test.pdf',
        }),
        download: vi.fn().mockResolvedValue({
            success: true,
            buffer: Buffer.from('mock pdf stream content'),
            contentType: 'application/pdf',
            filename: 'test.pdf',
        }),
        delete: vi.fn().mockResolvedValue({ success: true }),
        exists: vi.fn().mockResolvedValue(true),
        testConnection: vi.fn().mockResolvedValue({ success: true }),
        getCredentialSchema: vi.fn().mockReturnValue([
            { name: 'bucket', type: 'string', label: 'Bucket Name', required: true },
            { name: 'region', type: 'string', label: 'AWS Region', required: true },
        ]),
    });

    beforeEach(() => {
        vi.clearAllMocks();
        clearStorageRegistry();
        vi.mocked(getOrCreateEncryptionKey).mockResolvedValue(mockEncryptionKey);

        app = express();
        app.use(express.json());
        app.use('/api/file', file_router);
        app.use('/api/storage', storage_router);
    });

    describe('GET /api/storage/status', () => {
        it('should return hasActiveProvider: false when no provider is active', async () => {
            vi.mocked(storage_provider_model.findOne).mockResolvedValue(null as never);

            const res = await request(app).get('/api/storage/status');
            expect(res.status).toBe(200);
            expect(res.body.hasActiveProvider).toBe(false);
        });

        it('should return hasActiveProvider: true with provider summary when active', async () => {
            registerStorageProvider('s3', () => createMockProvider());

            const encrypted = encrypt(JSON.stringify({ bucket: 'b1', region: 'us-east-1' }), mockEncryptionKey);
            vi.mocked(storage_provider_model.findOne).mockResolvedValue({
                _id: '64f1234567890abcdef12345',
                name: 'Production S3',
                provider_type: 's3',
                is_active: true,
                enabled: true,
                config: encrypted,
            } as never);

            const res = await request(app).get('/api/storage/status');
            expect(res.status).toBe(200);
            expect(res.body.hasActiveProvider).toBe(true);
            expect(res.body.activeProvider.name).toBe('Production S3');
            expect(res.body.activeProvider.provider_type).toBe('s3');
        });
    });

    describe('GET /api/storage/providers', () => {
        it('should return available storage provider metadata', async () => {
            registerStorageProvider('s3', () => createMockProvider());

            const res = await request(app).get('/api/storage/providers');
            expect(res.status).toBe(200);
            expect(res.body.providers).toHaveLength(1);
            expect(res.body.providers[0].providerType).toBe('s3');
            expect(res.body.providers[0].credentialFields).toHaveLength(2);
        });
    });

    describe('POST /api/storage/test', () => {
        it('should reject unsupported provider type', async () => {
            const res = await request(app)
                .post('/api/storage/test')
                .send({ provider_type: 'unknown', config: {} });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Unsupported storage provider type');
        });

        it('should execute connection test with registered provider', async () => {
            registerStorageProvider('s3', () => createMockProvider());

            const res = await request(app)
                .post('/api/storage/test')
                .send({
                    provider_type: 's3',
                    config: { bucket: 'my-bucket', region: 'us-east-1' },
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain('successful');
        });
    });

    describe('POST /api/storage & Single Active Provider Invariant', () => {
        it('should validate credential fields against schema', async () => {
            registerStorageProvider('s3', () => createMockProvider());

            const res = await request(app)
                .post('/api/storage')
                .send({
                    name: 'Test S3',
                    provider_type: 's3',
                    config: { bucket: 'my-bucket' }, // missing region
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Validation failed');
            expect(res.body.details).toContain('AWS Region is required');
        });

        it('should create provider and enforce single active provider when is_active is true', async () => {
            registerStorageProvider('s3', () => createMockProvider());

            vi.mocked(storage_provider_model.updateMany).mockResolvedValue({} as never);
            vi.mocked(storage_provider_model.create).mockResolvedValue({
                _id: 'new-id',
                name: 'Main S3',
                provider_type: 's3',
                enabled: true,
                is_active: true,
                created_at: new Date(),
            } as never);

            const res = await request(app)
                .post('/api/storage')
                .send({
                    name: 'Main S3',
                    provider_type: 's3',
                    enabled: true,
                    is_active: true,
                    config: { bucket: 'my-bucket', region: 'us-east-1' },
                });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            // Verify demotion of existing active providers was triggered
            expect(storage_provider_model.updateMany).toHaveBeenCalledWith({}, { is_active: false });
        });

        it('should demote other providers when activate endpoint is called', async () => {
            const mockDoc = {
                _id: '507f1f77bcf86cd799439011',
                name: 'Backup Storage',
                provider_type: 's3',
                enabled: true,
                is_active: false,
                save: vi.fn().mockResolvedValue(undefined),
            };

            vi.mocked(storage_provider_model.findById).mockResolvedValue(mockDoc as never);
            vi.mocked(storage_provider_model.updateMany).mockResolvedValue({} as never);

            const res = await request(app)
                .patch('/api/storage/507f1f77bcf86cd799439011/activate');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(storage_provider_model.updateMany).toHaveBeenCalledWith(
                { _id: { $ne: '507f1f77bcf86cd799439011' } },
                { is_active: false }
            );
            expect(mockDoc.is_active).toBe(true);
        });
    });

    describe('POST /api/file/upload', () => {
        it('should return 400 when no files are attached in multipart request', async () => {
            const res = await request(app).post('/api/file/upload');
            expect(res.status).toBe(400);
            expect(res.body.error).toContain('No files provided');
        });

        it('should return 400 with helpful instruction when no active storage provider is available', async () => {
            vi.mocked(storage_provider_model.findOne).mockResolvedValue(null as never);

            const res = await request(app)
                .post('/api/file/upload')
                .attach('files', Buffer.from('hello attachment'), 'document.txt');

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('No active storage provider configured');
        });

        it('should successfully upload file, compute hash, and save attachment with active provider', async () => {
            registerStorageProvider('s3', () => createMockProvider());

            const encrypted = encrypt(JSON.stringify({ bucket: 'b1', region: 'us-east-1' }), mockEncryptionKey);
            vi.mocked(storage_provider_model.findOne).mockResolvedValue({
                _id: 'prov-1',
                name: 'Primary S3',
                provider_type: 's3',
                is_active: true,
                enabled: true,
                config: encrypted,
            } as never);

            vi.mocked(file_attachment_model.create).mockResolvedValue({
                toObject: () => ({
                    file_id: 'uuid-12345',
                    filename: 'invoice.pdf',
                    mime_type: 'application/pdf',
                    size: 15,
                    hash: 'abc123456789hash',
                    storage_provider: 's3',
                    url: 'https://s3.example.com/invoice.pdf',
                    created_at: new Date(),
                }),
            } as never);

            const res = await request(app)
                .post('/api/file/upload')
                .attach('files', Buffer.from('Sample PDF Data'), 'invoice.pdf');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.files).toHaveLength(1);
            expect(res.body.files[0].filename).toBe('invoice.pdf');
            expect(res.body.files[0].hash).toBeDefined();
        });
    });

    describe('GET /api/file/:id', () => {
        it('should return 404 if file does not exist', async () => {
            vi.mocked(file_attachment_model.findOne).mockReturnValue({
                lean: vi.fn().mockResolvedValue(null),
            } as never);

            const res = await request(app).get('/api/file/nonexistent');
            expect(res.status).toBe(404);
            expect(res.body.error).toBe('File not found');
        });

        it('should return file metadata if file exists', async () => {
            vi.mocked(file_attachment_model.findOne).mockReturnValue({
                lean: vi.fn().mockResolvedValue({
                    file_id: 'file-123',
                    filename: 'report.pdf',
                    mime_type: 'application/pdf',
                    size: 1024,
                    hash: 'sha256hash',
                    created_at: new Date(),
                }),
            } as never);

            const res = await request(app).get('/api/file/file-123');
            expect(res.status).toBe(200);
            expect(res.body.file.filename).toBe('report.pdf');
            expect(res.body.file.hash).toBe('sha256hash');
        });
    });
});
