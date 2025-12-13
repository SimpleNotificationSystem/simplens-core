/**
 * Simple Express server to test webhook callbacks
 * Run with: npx tsx client.ts
 */

import express from 'express';

const app = express();
const PORT = 4000;

// Hash table to track received notification IDs for duplicate detection
const receivedNotifications = new Map();

app.use(express.json());

// Webhook endpoint to receive notification status callbacks
app.post('/webhook', (req, res) => {
    const notificationId = req.body?.notification_id;
    const status = req.body?.status;

    console.log('\n========================================');

    // Check for duplicate
    if (notificationId && receivedNotifications.has(notificationId)) {
        const previousEntry = receivedNotifications.get(notificationId);
        console.log('⚠️  DUPLICATE WEBHOOK DETECTED!');
        console.log('========================================');
        console.log(`Notification ID: ${notificationId}`);
        console.log(`Previous status: ${previousEntry.status}`);
        console.log(`Previous time: ${previousEntry.receivedAt}`);
        console.log(`Current status: ${status}`);
        console.log(`Duplicate count: ${previousEntry.count + 1}`);
        console.log('========================================\n');

        // Update the count
        receivedNotifications.set(notificationId, {
            ...previousEntry,
            count: previousEntry.count + 1,
            lastStatus: status,
            lastReceivedAt: new Date().toISOString()
        });
    } else {
        console.log('📥 WEBHOOK RECEIVED');
        console.log('========================================');
        console.log('Headers:');
        console.log(`  X-Attempt: ${req.headers['x-attempt']}`);
        console.log('\nPayload:');
        console.log(JSON.stringify(req.body, null, 2));
        console.log('========================================\n');

        // Store the notification ID
        if (notificationId) {
            receivedNotifications.set(notificationId, {
                status,
                receivedAt: new Date().toISOString(),
                count: 1
            });
        }
    }

    res.status(200).json({ received: true });
    return;
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Stats endpoint to see received notifications
app.get('/stats', (req, res) => {
    const stats = {
        totalUnique: receivedNotifications.size,
        totalDuplicates: Array.from(receivedNotifications.values())
            .filter(n => n.count > 1)
            .reduce((sum, n) => sum + (n.count - 1), 0),
        notifications: Object.fromEntries(receivedNotifications)
    };
    res.json(stats);
});

app.listen(PORT, () => {
    console.log(`\n🚀 Webhook test server running at http://localhost:${PORT}`);
    console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook`);
    console.log(`📊 Stats endpoint: http://localhost:${PORT}/stats`);
    console.log(`\nUse this URL in your notification requests:`);
    console.log(`  "webhook_url": "http://host.docker.internal:${PORT}/webhook"`);
    console.log(`\n(Use host.docker.internal when calling from Docker containers)\n`);
});

