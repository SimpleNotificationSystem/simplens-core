/**
 * Common types used across worker modules
 */

export interface SendResult {
    successCount: number;
    failedCount: number;
}

export interface ProcessingStats {
    processed: number;
    success: number;
    failed: number;
}
