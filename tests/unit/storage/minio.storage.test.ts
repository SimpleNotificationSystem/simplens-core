import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MinioStorageProvider } from '@src/storage/providers/minio.storage.js';
import { hasStorageProvider, getStorageProvider } from '@src/storage/storage-registry.js';
import { Client } from 'minio';

let mockClientInstance: any;

vi.mock('minio', () => {
    return {
        Client: vi.fn().mockImplementation(function (this: any) {
            return mockClientInstance;
        }),
    };
});

describe('MinIO Storage Provider', () => {
    let mockClient: {
        bucketExists: ReturnType<typeof vi.fn>;
        makeBucket: ReturnType<typeof vi.fn>;
        putObject: ReturnType<typeof vi.fn>;
        getObject: ReturnType<typeof vi.fn>;
        statObject: ReturnType<typeof vi.fn>;
        removeObject: ReturnType<typeof vi.fn>;
        presignedGetObject: ReturnType<typeof vi.fn>;
    };

    const validConfig = {
        endPoint: 'localhost',
        port: '9000',
        useSSL: 'false',
        accessKey: 'minioadmin',
        secretKey: 'minioadmin',
        bucket: 'test-bucket',
        region: 'us-east-1',
    };

    beforeEach(() => {
        vi.clearAllMocks();

        mockClient = {
            bucketExists: vi.fn().mockResolvedValue(true),
            makeBucket: vi.fn().mockResolvedValue(undefined),
            putObject: vi.fn().mockResolvedValue({ etag: '12345' }),
            getObject: vi.fn().mockResolvedValue({ pipe: vi.fn() }),
            statObject: vi.fn().mockResolvedValue({
                size: 1024,
                metaData: {
                    'content-type': 'application/pdf',
                    'x-amz-meta-filename': encodeURIComponent('report.pdf'),
                },
            }),
            removeObject: vi.fn().mockResolvedValue(undefined),
            presignedGetObject: vi.fn().mockResolvedValue('http://localhost:9000/test-bucket/attachments/123/file.pdf'),
        };

        mockClientInstance = mockClient;
    });

    it('should self-register as "minio" provider in storage registry', () => {
        expect(hasStorageProvider('minio')).toBe(true);
        const provider = getStorageProvider('minio', validConfig);
        expect(provider.providerType).toBe('minio');
        expect(provider.displayName).toBe('MinIO Object Storage');
    });

    it('should return credential schema with required fields', () => {
        const provider = new MinioStorageProvider();
        const schema = provider.getCredentialSchema();

        const fieldNames = schema.map((f) => f.name);
        expect(fieldNames).toContain('endPoint');
        expect(fieldNames).toContain('accessKey');
        expect(fieldNames).toContain('secretKey');
        expect(fieldNames).toContain('bucket');

        const endpointField = schema.find((f) => f.name === 'endPoint');
        expect(endpointField?.required).toBe(true);
    });

    it('should test connection successfully when bucket exists', async () => {
        const provider = new MinioStorageProvider(validConfig);
        const result = await provider.testConnection();

        expect(result.success).toBe(true);
        expect(mockClient.bucketExists).toHaveBeenCalledWith('test-bucket');
    });

    it('should create bucket during test connection if bucket does not exist', async () => {
        mockClient.bucketExists.mockResolvedValue(false);

        const provider = new MinioStorageProvider(validConfig);
        const result = await provider.testConnection();

        expect(result.success).toBe(true);
        expect(mockClient.makeBucket).toHaveBeenCalledWith('test-bucket', 'us-east-1');
    });

    it('should return failure if connection test fails', async () => {
        mockClient.bucketExists.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:9000'));

        const provider = new MinioStorageProvider(validConfig);
        const result = await provider.testConnection();

        expect(result.success).toBe(false);
        expect(result.error).toContain('ECONNREFUSED');
    });

    it('should upload file buffer to MinIO bucket', async () => {
        const provider = new MinioStorageProvider(validConfig);

        const result = await provider.upload({
            fileId: 'f-123',
            filename: 'invoice.pdf',
            mimeType: 'application/pdf',
            size: 512,
            buffer: Buffer.from('test data'),
            hash: 'hash123',
        });

        expect(result.success).toBe(true);
        expect(result.storageKey).toBe('attachments/hash123/invoice.pdf');
        expect(mockClient.putObject).toHaveBeenCalledWith(
            'test-bucket',
            'attachments/hash123/invoice.pdf',
            expect.any(Buffer),
            512,
            expect.objectContaining({
                'Content-Type': 'application/pdf',
                'X-Amz-Meta-Fileid': 'f-123',
                'X-Amz-Meta-Hash': 'hash123',
            })
        );
    });

    it('should download file stream and extract metadata', async () => {
        const provider = new MinioStorageProvider(validConfig);

        const result = await provider.download('f-123', 'attachments/f-123/report.pdf');

        expect(result.success).toBe(true);
        expect(result.stream).toBeDefined();
        expect(result.contentType).toBe('application/pdf');
        expect(result.filename).toBe('report.pdf');
        expect(mockClient.getObject).toHaveBeenCalledWith('test-bucket', 'attachments/f-123/report.pdf');
    });

    it('should delete file from bucket', async () => {
        const provider = new MinioStorageProvider(validConfig);

        const result = await provider.delete('f-123', 'attachments/f-123/report.pdf');

        expect(result.success).toBe(true);
        expect(mockClient.removeObject).toHaveBeenCalledWith('test-bucket', 'attachments/f-123/report.pdf');
    });

    it('should check if file exists', async () => {
        const provider = new MinioStorageProvider(validConfig);

        const exists = await provider.exists('f-123', 'attachments/f-123/report.pdf');
        expect(exists).toBe(true);

        mockClient.statObject.mockRejectedValue(new Error('NotFound'));
        const notFound = await provider.exists('f-123', 'nonexistent');
        expect(notFound).toBe(false);
    });
});
