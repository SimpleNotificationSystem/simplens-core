/**
 * Webhook Test Server for SimpleNS
 * Receives and validates status callbacks from SimpleNS notification workers.
 *
 * Usage:
 *   node scripts/client.js [--port 4000]
 */

import express from 'express';

const app = express();

// Parse CLI port or fallback to PORT env / default 4000
const args = process.argv.slice(2);
let port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const portArgIndex = args.indexOf('--port');
if (portArgIndex !== -1 && args[portArgIndex + 1]) {
  port = parseInt(args[portArgIndex + 1], 10);
}

/**
 * @typedef {Object} WebhookRecord
 * @property {string} notificationId
 * @property {string} [requestId]
 * @property {string} [clientId]
 * @property {string} [channel]
 * @property {string} status
 * @property {string} [message]
 * @property {string} firstReceivedAt
 * @property {string} lastReceivedAt
 * @property {number} count
 */

const receivedNotifications = new Map();

app.use(express.json());

// Webhook endpoint to receive notification status callbacks from SimpleNS
app.post('/webhook', (req, res) => {
  const {
    notification_id: notificationId,
    request_id: requestId,
    client_id: clientId,
    status,
    channel,
    message,
    occurred_at: occurredAt,
  } = req.body || {};

  const now = new Date().toISOString();

  console.log('\n========================================');

  // Check for duplicate webhook
  if (notificationId && receivedNotifications.has(notificationId)) {
    const prev = receivedNotifications.get(notificationId);
    const count = prev.count + 1;

    console.log('⚠️  DUPLICATE WEBHOOK DETECTED!');
    console.log('========================================');
    console.log(`  Notification ID: ${notificationId}`);
    console.log(`  Channel:         ${channel || prev.channel || 'N/A'}`);
    console.log(`  Previous Status: ${prev.status} (${prev.lastReceivedAt})`);
    console.log(`  Current Status:  ${status}`);
    console.log(`  Total Hits:      ${count}`);
    console.log('========================================\n');

    receivedNotifications.set(notificationId, {
      ...prev,
      count,
      status,
      lastReceivedAt: now,
    });
  } else {
    console.log('📥 WEBHOOK RECEIVED');
    console.log('========================================');
    console.log(`  Notification ID: ${notificationId || 'N/A'}`);
    console.log(`  Request ID:      ${requestId || 'N/A'}`);
    console.log(`  Client ID:       ${clientId || 'N/A'}`);
    console.log(`  Channel:         ${channel || 'N/A'}`);
    console.log(`  Status:          ${status || 'N/A'}`);
    if (message) console.log(`  Message:         ${message}`);
    if (occurredAt) console.log(`  Occurred At:     ${occurredAt}`);
    console.log('========================================\n');

    if (notificationId) {
      receivedNotifications.set(notificationId, {
        notificationId,
        requestId,
        clientId,
        channel,
        status,
        message,
        firstReceivedAt: now,
        lastReceivedAt: now,
        count: 1,
      });
    }
  }

  res.status(200).json({ received: true });
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Stats endpoint to inspect delivery results
app.get('/stats', (_req, res) => {
  const records = Array.from(receivedNotifications.values());
  const delivered = records.filter(r => r.status === 'DELIVERED').length;
  const failed = records.filter(r => r.status === 'FAILED').length;
  const duplicates = records
    .filter(r => r.count > 1)
    .reduce((sum, r) => sum + (r.count - 1), 0);

  const byChannel = {};
  for (const r of records) {
    const ch = r.channel || 'unknown';
    byChannel[ch] = (byChannel[ch] || 0) + 1;
  }

  res.json({
    totalUnique: records.length,
    delivered,
    failed,
    totalDuplicates: duplicates,
    byChannel,
    notifications: Object.fromEntries(receivedNotifications),
  });
});

// Reset endpoint to clear records between test runs
app.all('/reset', (_req, res) => {
  const count = receivedNotifications.size;
  receivedNotifications.clear();
  console.log(`\n🧹 Cleared ${count} webhook records.\n`);
  res.json({ success: true, cleared: count });
});

const server = app.listen(port, () => {
  console.log(`\n🚀 Webhook receiver running at http://localhost:${port}`);
  console.log(`📡 Webhook endpoint: http://localhost:${port}/webhook`);
  console.log(`📊 Stats endpoint:   http://localhost:${port}/stats`);
  console.log(`🧹 Reset endpoint:   http://localhost:${port}/reset`);
  console.log('\nUse in SimpleNS requests:');
  console.log(`  Local:  "webhook_url": "http://localhost:${port}/webhook"`);
  console.log(`  Docker: "webhook_url": "http://host.docker.internal:${port}/webhook"\n`);
});

process.on('SIGINT', () => {
  console.log('\nShutting down webhook server...');
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

