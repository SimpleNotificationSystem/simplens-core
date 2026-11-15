import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UploadLockService } from '@src/storage/upload-lock.service.js';
import upload_lock_model from '@src/database/models/upload-lock.models.js';

vi.mock('@src/database/models/upload-lock.models.js');

describe('UploadLockService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('acquireLock', () => {
        it('should successfully acquire lock when lock key is free', async () => {
            vi.mocked(upload_lock_model.create).mockResolvedValue({} as never);

            const acquired = await UploadLockService.acquireLock('lock:minio:hash1:file.pdf', 'file-id-1');
            expect(acquired).toBe(true);
            expect(upload_lock_model.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    lock_key: 'lock:minio:hash1:file.pdf',
                    locked_by: 'file-id-1',
                })
            );
        });

        it('should return false when lock is held by another process and not expired', async () => {
            const duplicateError = new Error('Duplicate key') as any;
            duplicateError.code = 11000;
            vi.mocked(upload_lock_model.create).mockRejectedValue(duplicateError);

            // Existing lock is in the future
            vi.mocked(upload_lock_model.findOne).mockResolvedValue({
                lock_key: 'lock:minio:hash1:file.pdf',
                locked_by: 'file-id-other',
                expires_at: new Date(Date.now() + 20000),
            } as never);

            const acquired = await UploadLockService.acquireLock('lock:minio:hash1:file.pdf', 'file-id-1');
            expect(acquired).toBe(false);
        });

        it('should take over expired lock', async () => {
            const duplicateError = new Error('Duplicate key') as any;
            duplicateError.code = 11000;
            vi.mocked(upload_lock_model.create).mockRejectedValue(duplicateError);

            // Existing lock is in the past
            const expiredDate = new Date(Date.now() - 5000);
            vi.mocked(upload_lock_model.findOne).mockResolvedValue({
                lock_key: 'lock:minio:hash1:file.pdf',
                locked_by: 'file-id-other',
                expires_at: expiredDate,
            } as never);

            vi.mocked(upload_lock_model.findOneAndUpdate).mockResolvedValue({
                lock_key: 'lock:minio:hash1:file.pdf',
                locked_by: 'file-id-1',
            } as never);

            const acquired = await UploadLockService.acquireLock('lock:minio:hash1:file.pdf', 'file-id-1');
            expect(acquired).toBe(true);
            expect(upload_lock_model.findOneAndUpdate).toHaveBeenCalled();
        });
    });

    describe('releaseLock', () => {
        it('should delete lock entry for lockKey and lockedBy', async () => {
            vi.mocked(upload_lock_model.deleteOne).mockResolvedValue({ acknowledged: true, deletedCount: 1 } as never);

            await UploadLockService.releaseLock('lock:minio:hash1:file.pdf', 'file-id-1');
            expect(upload_lock_model.deleteOne).toHaveBeenCalledWith({
                lock_key: 'lock:minio:hash1:file.pdf',
                locked_by: 'file-id-1',
            });
        });
    });
});
