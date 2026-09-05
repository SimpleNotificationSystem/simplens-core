import { z } from 'zod';

/**
 * Shared Zod schemas for MCP tools
 */

// MongoDB ObjectId validation schema (24-character hexadecimal string)
export const objectIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/);

// Common pagination and filter schemas for list tools
export const paginationSchemas = {
    page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
    limit: z.number().int().min(1).max(100).optional().describe('Results per page (default: 20)'),
};
