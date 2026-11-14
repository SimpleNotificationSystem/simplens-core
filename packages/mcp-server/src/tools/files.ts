/**
 * Tools: File Attachments & Storage
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserCredentials } from '../auth.js';
import { ApiClient } from '../api-client.js';
import { formatApiResponse, formatToolError } from './response.js';

export function registerFileTools(server: McpServer, getCredentials: () => UserCredentials) {
    // 1. upload_file
    server.registerTool(
        'upload_file',
        {
            description:
                'Upload a file directly to the active SimpleNS storage provider (e.g. MinIO, S3).\n' +
                'Provide either `file_path` (for local files on disk) or `content_base64` + `filename` (for in-memory / remote agents).\n' +
                'Returns file attachment metadata (id, filename, mime_type, size, hash, url) which can be attached to notifications via `attachments` array.',
            inputSchema: {
                file_path: z.string().optional().describe('Absolute or relative path to a local file on disk to upload'),
                content_base64: z.string().optional().describe('Base64-encoded file content (use if file_path is not available)'),
                filename: z.string().optional().describe('Desired filename with extension (required if content_base64 is provided)'),
                mime_type: z.string().optional().describe('Optional MIME type of the file (e.g. "application/pdf", "image/png")'),
                channel: z.string().optional().describe('Optional target notification channel (e.g. "email") to enforce channel-specific attachment limits'),
                provider: z.string().optional().describe('Optional target provider ID (e.g. "resend-primary") to enforce provider-specific attachment limits'),
            },
        },
        async (params) => {
            try {
                if (!params.file_path && !params.content_base64) {
                    return formatToolError('Upload failed', new Error('Either file_path or content_base64 must be provided'));
                }
                if (params.content_base64 && !params.filename) {
                    return formatToolError('Upload failed', new Error('filename is required when uploading via content_base64'));
                }

                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.uploadFile({
                    filePath: params.file_path,
                    contentBase64: params.content_base64,
                    filename: params.filename,
                    mimeType: params.mime_type,
                    channel: params.channel,
                    provider: params.provider,
                });
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError('Failed to upload file', error);
            }
        }
    );

    // 2. get_file_metadata
    server.registerTool(
        'get_file_metadata',
        {
            description: 'Retrieve file metadata (filename, mime type, size, hash, url, created_at) for an uploaded attachment by its file ID.',
            inputSchema: {
                id: z.string().min(1).describe('The unique file ID (UUID) of the uploaded attachment'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.getFileMetadata(params.id);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError(`Failed to get metadata for file '${params.id}'`, error);
            }
        }
    );

    // 3. download_file
    server.registerTool(
        'download_file',
        {
            description:
                'Download an uploaded file from SimpleNS storage by its file ID.\n' +
                'If `save_path` is specified, the file will be saved directly to that disk path.\n' +
                'Otherwise, returns file size, content type, and base64 encoded content (for files <= 10MB).',
            inputSchema: {
                id: z.string().min(1).describe('The unique file ID (UUID) of the file to download'),
                save_path: z.string().optional().describe('Optional local file path to save the downloaded file to'),
            },
        },
        async (params) => {
            try {
                const credentials = getCredentials();
                const client = new ApiClient(credentials);
                const result = await client.downloadFile(params.id, params.save_path);
                return formatApiResponse(result);
            } catch (error) {
                return formatToolError(`Failed to download file '${params.id}'`, error);
            }
        }
    );
}
