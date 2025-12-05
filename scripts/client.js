/**
 * Simple Express server to test webhook callbacks
 * Run with: npx tsx client.ts
 */

import express from 'express';

const app = express();
const PORT = 4000;

app.use(express.json());

// Webhook endpoint to receive notification status callbacks
app.post('/webhook', (req, res) => {
    console.log('\n========================================');
    console.log('📥 WEBHOOK RECEIVED');
    console.log('========================================');
    console.log('Headers:');
    console.log(`  X-Attempt: ${req.headers['x-attempt']}`);
    console.log('\nPayload:');
    console.log(JSON.stringify(req.body, null, 2));
    console.log('========================================\n');

    res.status(200).json({ received: true });
    return;
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`\n🚀 Webhook test server running at http://localhost:${PORT}`);
    console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook`);
    console.log(`\nUse this URL in your notification requests:`);
    console.log(`  "webhook_url": "http://host.docker.internal:${PORT}/webhook"`);
    console.log(`\n(Use host.docker.internal when calling from Docker containers)\n`);
});
