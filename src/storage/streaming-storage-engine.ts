/**
 * Streaming Storage Engine for Multer
 * Pipes incoming multipart file streams directly into the active storage provider via StorageService
 */

import type { Request } from 'express';
import type { StorageEngine } from 'multer';
import { StorageService } from './storage.service.js';
import { apiLogger as logger } from '@src/workers/utils/logger.js';
import type { FileAttachmentDoc } from '@src/types/types.js';

export interface UploadedAttachmentInfo extends Partial<Express.Multer.File> {
    attachmentDoc?: FileAttachmentDoc;
}

export class StreamingStorageEngine implements StorageEngine {
    _handleFile(
        req: Request,
        file: Express.Multer.File,
        callback: (error?: unknown, info?: UploadedAttachmentInfo) => void
    ): void {
        StorageService.saveFile({
            originalname: file.originalname,
            mimetype: file.mimetype,
            stream: file.stream,
        })
            .then((doc) => {
                callback(null, {
                    ...file,
                    size: doc.size,
                    attachmentDoc: doc,
                });
            })
            .catch((err) => {
                logger.error(`Streaming upload failed for '${file.originalname}':`, err);
                callback(err);
            });
    }

    _removeFile(
        req: Request,
        file: Express.Multer.File & { attachmentDoc?: FileAttachmentDoc },
        callback: (error: Error | null) => void
    ): void {
        if (file.attachmentDoc?.file_id) {
            StorageService.deleteFile(file.attachmentDoc.file_id)
                .then(() => callback(null))
                .catch((err) => callback(err instanceof Error ? err : new Error(String(err))));
        } else {
            callback(null);
        }
    }
}

export function createStreamingStorageEngine(): StreamingStorageEngine {
    return new StreamingStorageEngine();
}
