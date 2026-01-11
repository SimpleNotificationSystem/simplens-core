/**
 * Universal Notification Load Test & Send Script
 * 
 * Merges functionality of load-test.js and send-email.js.
 * Supports sending single notifications or running high-concurrency load tests.
 * Supports multiple channels and providers.
 * 
 * Usage: 
 *   node scripts/load-test.js [options]
 * 
 * Options:
 *   -n, --requests <number>    Total number of requests (default: 1)
 *   -c, --concurrency <number> Number of concurrent requests (default: 1)
 *   -t, --template <id>        Template ID to use
 *   -ch, --channels <list>     Comma-separated list of channels (default: email)
 *   -p, --providers <list>     Comma-separated list of provider IDs (optional)
 *   -to, --to <user_id>        Recipient User ID (default: user_12345)
 *                               Note: For email channel, this is treated as email if it looks like one.
 *   -s, --subject <string>     Subject (for email)
 *   -m, --message <string>     Message content (for all channels)
 *   -h, --host <type>          Webhook host type: 'local' or 'docker' (default: local)
 *   --help                     Show this help message
 * 
 * Examples:
 *   Load Test: node scripts/load-test.js -n 1000 -c 50
 *   Single Email: node scripts/load-test.js --to user@example.com -s "Hello" -m "World"
 *   Multi-Channel: node scripts/load-test.js -ch email,whatsapp -p resend,twilio -m "Alert!"
 */

import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import process from 'process';

dotenv.config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const NS_API_KEY = process.env.NS_API_KEY || '4YCItWcuH2qJe3bXM9LbsbqefflWFlXlzvneMRSSQhU=';

// --- Argument Parsing ---
const args = process.argv.slice(2);
const config = {
    requests: 1,
    concurrency: 1,
    templateId: null,
    channels: ['email'],
    providers: [],
    to: 'test@example.com',
    subject: 'Test Notification',
    message: 'This is a test notification from the load-test script.',
    hostType: 'local',
    help: false
};

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
        case '-n':
        case '--requests':
            config.requests = parseInt(args[++i]);
            break;
        case '-c':
        case '--concurrency':
            config.concurrency = parseInt(args[++i]);
            break;
        case '-t':
        case '--template':
            config.templateId = args[++i];
            break;
        case '-ch':
        case '--channels':
            config.channels = args[++i].split(',');
            break;
        case '-p':
        case '--providers':
            config.providers = args[++i].split(',');
            break;
        case '-to':
        case '--to':
            config.to = args[++i];
            break;
        case '-s':
        case '--subject':
            config.subject = args[++i];
            break;
        case '-m':
        case '--message':
            config.message = args[++i];
            break;
        case '-h':
        case '--host':
            config.hostType = args[++i];
            break;
        case '--help':
            config.help = true;
            break;
        default:
             // Backwards compatibility for positional args: [requests] [concurrency]
             if (!isNaN(parseInt(arg)) && i === 0) config.requests = parseInt(arg);
             else if (!isNaN(parseInt(arg)) && i === 1) config.concurrency = parseInt(arg);
    }
}

if (config.help) {
    console.log(`
Usage: node scripts/load-test.js [options]

Options:
  -n, --requests <number>    Total requests (default: 1)
  -c, --concurrency <number> Concurrency (default: 1)
  -t, --template <id>        Template ID
  -ch, --channels <list>     Comma-separated channels (e.g. email,whatsapp)
  -p, --providers <list>     Comma-separated providers (e.g. resend,twilio)
  -to, --to <id/email>       Recipient ID or Email
  -s, --subject <string>     Subject (email)
  -m, --message <string>     Message body
  -h, --host <type>          Webhook host (local/docker)
    `);
    process.exit(0);
}

const webhookHost = config.hostType === 'docker' ? 'host.docker.internal' : 'localhost';

// --- Payload Generation ---
const createPayload = () => {
    // Construct Recipient
    const recipient = {
        user_id: "user_" + Math.floor(Math.random() * 10000)
    };

    // Heuristic: if 'to' looks like an email, put it in email field for email channel
    // For universal usage, we might just put it in user_id if it's not an email, or both.
    // The backend usually resolves fields from user_id if not present, but for test script we want explicit control.
    if (config.to.includes('@')) {
        recipient.email = config.to;
         // still keep a user_id
    } else {
        recipient.user_id = config.to;
        // If it's a phone number, maybe add phone?
        if (/^\+?\d+$/.test(config.to)) {
            recipient.phone_number = config.to;
        }
    }

    const payload = {
        request_id: randomUUID(),
        client_id: randomUUID(),
        channel: config.channels,
        recipient: recipient,
        content: {},
        webhook_url: `http://${webhookHost}:4000/webhook`,
        retry_count: 3
    };

    if (config.providers.length > 0) {
        payload.provider = config.providers;
    }

    if (config.templateId) {
        payload.template_id = config.templateId;
        // Initialize empty content structure for selected channels to ensure schema validation passes if needed
        config.channels.forEach(ch => {
            payload.content[ch] = {};
        });
    } else {
        // Construct Generic Content
        config.channels.forEach(ch => {
            if (ch === 'email') {
                payload.content.email = {
                    subject: config.subject,
                    message: config.message
                };
            } else {
                // Generic message for other channels (sms, whatsapp, push, etc.)
                payload.content[ch] = {
                    message: config.message
                };
            }
        });
    }

    return payload;
};

// --- Request Logic ---
const sendRequest = async (index) => {
    const start = Date.now();
    try {
        const response = await fetch(`${BASE_URL}/api/notification`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${NS_API_KEY}`
            },
            body: JSON.stringify(createPayload())
        });

        const duration = Date.now() - start;
        const status = response.status;
        
        let data = null;
        if (config.requests === 1) {
             try { data = await response.json(); } catch(e) {}
        }

        return { index, status, duration, success: status >= 200 && status < 300, data, error: null };
    } catch (err) {
        const duration = Date.now() - start;
        return { index, status: 0, duration, success: false, error: err.message, data: null };
    }
};

const runBatch = async (startIndex, batchSize) => {
    const promises = [];
    for (let i = 0; i < batchSize; i++) {
        promises.push(sendRequest(startIndex + i));
    }
    return Promise.all(promises);
};

// --- Main Execution ---
const main = async () => {
    console.log('🚀 Notification Test Configuration:');
    console.log(`   URL: ${BASE_URL}/api/notification`);
    console.log(`   Mode: ${config.requests > 1 ? 'Load Test' : 'Single Send'}`);
    console.log(`   Requests: ${config.requests}`);
    console.log(`   Concurrency: ${config.concurrency}`);
    console.log(`   Channels: ${config.channels.join(', ')}`);
    if (config.providers.length) console.log(`   Providers: ${config.providers.join(', ')}`);
    if (config.templateId) console.log(`   Template: ${config.templateId}`);
    
    console.log(`   Recipient: ${config.to}`);
    console.log('');

    const results = [];
    const startTime = Date.now();
    let completed = 0;

    // Process in batches
    for (let i = 0; i < config.requests; i += config.concurrency) {
        const batchSize = Math.min(config.concurrency, config.requests - i);
        const batchResults = await runBatch(i, batchSize);
        results.push(...batchResults);

        completed += batchSize;
        if (config.requests > 1) {
            process.stdout.write(`\r⏳ Progress: ${completed}/${config.requests} (${Math.round(completed / config.requests * 100)}%)`);
        }
    }

    const totalTime = Date.now() - startTime;

    // --- Reporting ---
    if (config.requests === 1) {
        // Single Request Detailed Report
        const result = results[0];
        console.log('\n\n📊 Result:');
        if (result.success) {
            console.log('   ✅ Success');
            console.log(`   Status: ${result.status}`);
            console.log(`   Duration: ${result.duration}ms`);
            if (result.data) console.log('   Response:', JSON.stringify(result.data, null, 2));
        } else {
            console.log('   ❌ Failed');
            console.log(`   Error: ${result.error}`);
            console.log(`   Status: ${result.status}`);
            // Check for common issues
            if (result.status === 404) console.log('   Hint: Check if the endpoint URL is correct.');
            if (result.status === 401) console.log('   Hint: Check your API Key.');
        }
    } else {
        // Load Test Summary Report
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        const durations = results.map(r => r.duration);
        const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
        const minDuration = Math.min(...durations);
        const maxDuration = Math.max(...durations);
        const requestsPerSecond = (config.requests / totalTime) * 1000;

        const statusCodes = {};
        results.forEach(r => {
            statusCodes[r.status] = (statusCodes[r.status] || 0) + 1;
        });

        console.log('\n\n📊 Load Test Results:');
        console.log('─'.repeat(40));
        console.log(`   Total Time:     ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
        console.log(`   Requests/sec:   ${requestsPerSecond.toFixed(2)}`);
        console.log(`   Successful:     ${successful} ✅`);
        console.log(`   Failed:         ${failed} ❌`);
        console.log('');
        console.log('⏱️  Latency:');
        console.log(`   Min:            ${minDuration}ms`);
        console.log(`   Avg:            ${avgDuration.toFixed(2)}ms`);
        console.log(`   Max:            ${maxDuration}ms`);
        console.log('');
        console.log('📈 Status Codes:');
        Object.entries(statusCodes).sort().forEach(([code, count]) => {
            console.log(`   ${code}: ${count}`);
        });
    }
};

main().catch(console.error);
