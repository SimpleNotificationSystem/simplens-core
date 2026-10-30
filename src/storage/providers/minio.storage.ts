/**
 * MinIO Storage Provider
 * Implements StorageProvider for MinIO and S3-compatible object storage
 * Self-registers on module load
 */

import { Client } from 'minio';
import type {
    StorageProvider,
    StorageUploadInput,
    StorageUploadResult,
    StorageDownloadResult,
    StorageDeleteResult,
    StorageResult,
    StorageUrlOptions,
    CredentialField,
    MinioStorageConfig,
} from '@src/types/types.js';
import { minioStorageConfigSchema } from '@src/types/schemas.js';
import { registerStorageProvider } from '../storage-registry.js';
import { apiLogger as logger } from '@src/workers/utils/logger.js';

export class MinioStorageProvider implements StorageProvider {
    readonly providerType = 'minio' as const;
    readonly displayName = 'MinIO Object Storage';

    private client: Client | null = null;
    private config: MinioStorageConfig | null = null;

    constructor(rawConfig?: unknown) {
        if (rawConfig && typeof rawConfig === 'object' && Object.keys(rawConfig).length > 0) {
            const parsed = minioStorageConfigSchema.safeParse(rawConfig);
            if (parsed.success) {
                this.config = parsed.data;
                this.client = new Client({
                    endPoint: this.config.endPoint,
                    port: this.config.port,
                    useSSL: this.config.useSSL ?? false,
                    accessKey: this.config.accessKey,
                    secretKey: this.config.secretKey,
                    region: this.config.region || 'us-east-1',
                });
            }
        }
    }

    getCredentialSchema(): CredentialField[] {
        return [
            {
                name: 'endPoint',
                type: 'string',
                label: 'Endpoint Host',
                placeholder: 'e.g. localhost or play.min.io',
                description: 'MinIO server hostname or IP address (without http:// or https://)',
                required: true,
            },
            {
                name: 'port',
                type: 'string',
                label: 'Port',
                placeholder: 'e.g. 9000',
                description: 'Port number (default: 9000)',
                required: false,
            },
            {
                name: 'useSSL',
                type: 'string',
                label: 'Use SSL (true/false)',
                placeholder: 'false',
                description: 'Set to true if using HTTPS, false otherwise',
                required: false,
            },
            {
                name: 'accessKey',
                type: 'string',
                label: 'Access Key',
                placeholder: 'minioadmin',
                description: 'MinIO root user or IAM access key',
                required: true,
            },
            {
                name: 'secretKey',
                type: 'secret',
                label: 'Secret Key',
                placeholder: 'minioadmin',
                description: 'MinIO root user or IAM secret key',
                required: true,
            },
            {
                name: 'bucket',
                type: 'string',
                label: 'Bucket Name',
                placeholder: 'e.g. simplens-attachments',
                description: 'Target bucket for storing notification file attachments',
                required: true,
            },
            {
                name: 'region',
                type: 'string',
                label: 'Region',
                placeholder: 'e.g. us-east-1',
                description: 'Bucket region (optional, defaults to us-east-1)',
                required: false,
            },
        ];
    }

    private async ensureBucket(): Promise<void> {
        if (!this.client || !this.config) {
            throw new Error('MinIO client is not initialized with valid credentials');
        }
        const exists = await this.client.bucketExists(this.config.bucket);
        if (!exists) {
            await this.client.makeBucket(this.config.bucket, this.config.region || 'us-east-1');
        }
    }

    async upload(file: StorageUploadInput): Promise<StorageUploadResult> {
        try {
            if (!this.client || !this.config) {
                return { success: false, fileId: file.fileId, error: 'MinIO client not configured' };
            }

            await this.ensureBucket();

            const storageKey = `attachments/${file.hash}/${file.filename}`;
            const metadata: Record<string, string> = {
                'Content-Type': file.mimeType,
                'X-Amz-Meta-Fileid': file.fileId,
                'X-Amz-Meta-Filename': encodeURIComponent(file.filename),
                'X-Amz-Meta-Hash': file.hash,
            };

            await this.client.putObject(
                this.config.bucket,
                storageKey,
                file.buffer,
                file.size,
                metadata
            );

            let url: string | undefined;
            try {
                url = await this.client.presignedGetObject(this.config.bucket, storageKey, 7 * 24 * 60 * 60);
            } catch {
                // Presigned URL generation is optional
            }

            return {
                success: true,
                fileId: file.fileId,
                storageKey,
                url,
            };
        } catch (err) {
            logger.error('MinIO upload failed:', err);
            return {
                success: false,
                fileId: file.fileId,
                error: err instanceof Error ? err.message : 'MinIO upload failed',
            };
        }
    }

    async download(fileId: string, storageKey?: string): Promise<StorageDownloadResult> {
        try {
            if (!this.client || !this.config) {
                return { success: false, error: 'MinIO client not configured' };
            }

            const key = storageKey || `attachments/${fileId}`;
            const stream = await this.client.getObject(this.config.bucket, key);
            const stat = await this.client.statObject(this.config.bucket, key);

            return {
                success: true,
                stream,
                contentType: stat.metaData?.['content-type'],
                filename: stat.metaData?.['x-amz-meta-filename']
                    ? decodeURIComponent(stat.metaData['x-amz-meta-filename'])
                    : undefined,
            };
        } catch (err) {
            logger.error(`MinIO download failed for ${fileId}:`, err);
            return {
                success: false,
                error: err instanceof Error ? err.message : 'MinIO download failed',
            };
        }
    }

    async delete(fileId: string, storageKey?: string): Promise<StorageDeleteResult> {
        try {
            if (!this.client || !this.config) {
                return { success: false, error: 'MinIO client not configured' };
            }

            const key = storageKey || `attachments/${fileId}`;
            await this.client.removeObject(this.config.bucket, key);
            return { success: true };
        } catch (err) {
            logger.error(`MinIO delete failed for ${fileId}:`, err);
            return {
                success: false,
                error: err instanceof Error ? err.message : 'MinIO delete failed',
            };
        }
    }

    async exists(fileId: string, storageKey?: string): Promise<boolean> {
        try {
            if (!this.client || !this.config) return false;
            const key = storageKey || `attachments/${fileId}`;
            await this.client.statObject(this.config.bucket, key);
            return true;
        } catch {
            return false;
        }
    }

    async getUrl(fileId: string, options?: StorageUrlOptions, storageKey?: string): Promise<string> {
        if (!this.client || !this.config) {
            throw new Error('MinIO client not configured');
        }
        const key = storageKey || `attachments/${fileId}`;
        const expiry = options?.expiresInSeconds || 24 * 60 * 60;
        return this.client.presignedGetObject(this.config.bucket, key, expiry);
    }

    async testConnection(): Promise<StorageResult> {
        try {
            if (!this.client || !this.config) {
                return { success: false, error: 'MinIO configuration is invalid or incomplete' };
            }

            const exists = await this.client.bucketExists(this.config.bucket);
            if (!exists) {
                await this.client.makeBucket(this.config.bucket, this.config.region || 'us-east-1');
            }

            return { success: true };
        } catch (err) {
            logger.error('MinIO connection test failed:', err);
            return {
                success: false,
                error: err instanceof Error ? err.message : 'Failed to connect to MinIO storage',
            };
        }
    }
}

// Self-register with storage registry on module import
registerStorageProvider('minio', (config: unknown) => {
    return new MinioStorageProvider(config);
});
