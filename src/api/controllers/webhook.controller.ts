/**
 * Webhook Controller
 * 
 * Handles incoming notification status callbacks (e.g. delivery receipts, provider webhooks).
 */

import type { Request, Response } from 'express';
import { apiLogger as logger } from '@src/workers/utils/logger.js';

export const handleWebhookCallback = async (req: Request, res: Response): Promise<void> => {
    try {
        const payload = req.body;

        logger.info('[Webhook] Received callback:', {
            request_id: payload?.request_id,
            notification_id: payload?.notification_id,
            status: payload?.status,
            channel: payload?.channel,
            occurred_at: payload?.occurred_at,
        });

        res.status(200).json({ received: true });
    } catch (error) {
        logger.error('[Webhook] Error processing callback:', error);
        res.status(400).json({ received: false, error: 'Invalid payload' });
    }
};
