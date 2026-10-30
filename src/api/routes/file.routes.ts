import { Router } from 'express';
import {
    uploadFiles,
    getFileMetadata,
    downloadFile,
    fileUploadMiddleware,
} from '../controllers/storage.controller.js';

const router = Router();

// POST /api/file/upload
router.post('/upload', fileUploadMiddleware, uploadFiles);

// GET /api/file/:id
router.get('/:id', getFileMetadata);

// GET /api/file/:id/download
router.get('/:id/download', downloadFile);

export default router;
