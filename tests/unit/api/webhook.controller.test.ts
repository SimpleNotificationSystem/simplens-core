import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import webhook_router from '@src/api/routes/webhook.routes.js';

describe('Webhook Controller', () => {
    let app: express.Application;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use('/api/webhook', webhook_router);
    });

    it('should acknowledge valid webhook status callbacks with 200 and { received: true }', async () => {
        const payload = {
            request_id: 'req-123',
            notification_id: 'notif-456',
            status: 'delivered',
            channel: 'email',
            occurred_at: new Date().toISOString(),
        };

        const res = await request(app)
            .post('/api/webhook')
            .send(payload)
            .expect(200);

        expect(res.body).toEqual({ received: true });
    });

    it('should return 200 even for empty payload', async () => {
        const res = await request(app)
            .post('/api/webhook')
            .send({})
            .expect(200);

        expect(res.body).toEqual({ received: true });
    });
});
