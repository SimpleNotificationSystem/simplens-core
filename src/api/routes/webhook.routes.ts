/**
 * Webhook Routes
 */

import { Router } from 'express';
import { handleWebhookCallback } from '../controllers/webhook.controller.js';

const router = Router();

router.post('/', handleWebhookCallback);

export default router;
