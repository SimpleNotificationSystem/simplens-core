import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable } from 'stream';
import { HashingAndMeteringStream, StorageService } from '@src/storage/storage.service.js';
import { StreamingStorageEngine } from '@src/storage/streaming-storage-engine.js';
import { env } from '@src/config/env.config.js';
import { ProviderManagerService } from '@src/plugins/services/provider-manager.service.js';

describe('HashingAndMeteringStream', () => {
    it('should calculate accurate byte count and sha-256 hash', async () => {
        const stream = new HashingAndMeteringStream(1024 * 1024);
        const data = Buffer.from('hello simplens streaming attachment');
        const expectedHash = StorageService.computeHash(data);

        await new Promise<void>((resolve, reject) => {
            Readable.from([data])
                .pipe(stream)
                .on('finish', () => resolve())
                .on('error', reject);
        });

        expect(stream.bytesCount).toBe(data.length);
        expect(stream.calculatedHash).toBe(expectedHash);
    });

    it('should throw error when stream exceeds maxBytes limit', async () => {
        const stream = new HashingAndMeteringStream(10); // 10 bytes limit
        const data = Buffer.from('this is longer than ten bytes');

        const error = await new Promise<Error | null>((resolve) => {
            Readable.from([data])
                .pipe(stream)
                .on('error', (err) => resolve(err))
                .on('finish', () => resolve(null));
        });

        expect(error).not.toBeNull();
        expect(error?.message).toContain('File size exceeds maximum allowed limit');
    });
});

describe('StorageService.resolveEffectiveLimits', () => {
    it('should return global limits when no provider limit is set', async () => {
        const limits = await StorageService.resolveEffectiveLimits();
        expect(limits.enabled).toBe(true);
        expect(limits.maxFileSize).toBe(env.SIMPLENS_MAX_FILE_SIZE);
        expect(limits.maxCount).toBe(env.SIMPLENS_MAX_FILE_COUNT);
    });

    it('should return enabled false when provider disables attachments', async () => {
        const spy = vi.spyOn(ProviderManagerService, 'getEffectiveFileAttachmentConfig').mockResolvedValueOnce({
            enabled: false,
        });
        const limits = await StorageService.resolveEffectiveLimits('email', 'p-disabled');
        expect(limits.enabled).toBe(false);
        spy.mockRestore();
    });
});

describe('StreamingStorageEngine', () => {
    it('should stream file and return attachment document in callback', async () => {
        const mockAttachment = {
            file_id: 'att-123',
            filename: 'test.pdf',
            mime_type: 'application/pdf',
            size: 100,
            hash: 'hash-abc',
        };

        const saveFileSpy = vi.spyOn(StorageService, 'saveFile').mockResolvedValue(mockAttachment as never);

        const engine = new StreamingStorageEngine();
        const mockFile = {
            fieldname: 'files',
            originalname: 'test.pdf',
            mimetype: 'application/pdf',
            stream: Readable.from(['pdf content']),
        } as Express.Multer.File;

        await new Promise<void>((resolve, reject) => {
            engine._handleFile({} as any, mockFile, (err, info) => {
                if (err) return reject(err);
                try {
                    expect(info?.attachmentDoc).toEqual(mockAttachment);
                    expect(info?.size).toBe(100);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        });

        expect(saveFileSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                originalname: 'test.pdf',
                mimetype: 'application/pdf',
            })
        );
    });

    it('should delete file on removeFile if file_id exists', async () => {
        const deleteFileSpy = vi.spyOn(StorageService, 'deleteFile').mockResolvedValue(true);

        const engine = new StreamingStorageEngine();
        const mockFileWithDoc = {
            attachmentDoc: { file_id: 'doc-to-delete' },
        } as any;

        await new Promise<void>((resolve, reject) => {
            engine._removeFile({} as any, mockFileWithDoc, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });

        expect(deleteFileSpy).toHaveBeenCalledWith('doc-to-delete');
    });
});
