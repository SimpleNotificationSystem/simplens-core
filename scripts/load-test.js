/**
 * Universal Notification Load Test & Send Script for SimpleNS
 * 
 * Supports sending single notifications or running high-concurrency load tests.
 * Supports multiple channels, providers, templates, and scheduled delays.
 * 
 * Usage: 
 *   node scripts/load-test.js [options]
 * 
 * Options:
 *   -n, --requests <number>     Total number of requests (default: 1)
 *   -c, --concurrency <number>  Number of concurrent requests (default: 1)
 *   -t, --template <id>         Template ID to use (auto-wrapped in array)
 *   -ch, --channels <list>      Comma-separated list of channels (default: mock)
 *   -p, --providers <list>      Comma-separated list of provider IDs (optional)
 *   -to, --to <user_id/email>   Recipient User ID or Email (default: test@example.com)
 *   -s, --subject <string>      Subject (for email)
 *   -m, --message <string>      Message content (for all channels)
 *   -u, --url <url>             Base API URL (default: http://localhost:3000)
 *   -k, --key <string>          SimpleNS API Key (defaults to NS_API_KEY env or dev key)
 *   -h, --host <type>           Webhook host type: 'local', 'docker', or custom hostname (default: local)
 *   -w, --webhook <url>         Explicit webhook URL override
 *   -v, --variables <json>      Template variables as JSON string (e.g. '{"name":"Alex"}')
 *   -d, --delay <seconds>       Schedule notification in the future (scheduled_at)
 *   --help                      Show this help message
 * 
 * Examples:
 *   Single Mock Send:   node scripts/load-test.js -ch mock -p mock -m "Hello SimpleNS"
 *   Single Email:       node scripts/load-test.js -ch email --to user@example.com -s "Hello" -m "World"
 *   High Load Test:     node scripts/load-test.js -n 500 -c 50 -ch mock -p mock
 *   Template Send:      node scripts/load-test.js -t welcome_tpl -v '{"name":"Sam"}'
 */

import { randomUUID } from 'crypto';
import http from 'http';
import https from 'https';
import process from 'process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import axios from 'axios';
import dotenv from 'dotenv';

// Resolve project root directory dynamically
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRootDir = join(__dirname, '..');

// Explicitly load .env from project root, then fallback to current working directory
dotenv.config({ path: join(projectRootDir, '.env') });
dotenv.config();

// HTTP Connection Pooling for high concurrency load testing
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 200 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 200 });

// --- Argument Parsing ---
const args = process.argv.slice(2);
const config = {
  requests: 1,
  concurrency: 1,
  templateId: null,
  channels: ['mock'],
  providers: [],
  to: 'test@example.com',
  subject: 'Test Notification',
  message: 'This is a test notification from SimpleNS load test script.',
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  apiKey: process.env.NS_API_KEY || '4YCItWcuH2qJe3bXM9LbsbqefflWFlXlzvneMRSSQhU=',
  hostType: 'local',
  webhookUrl: null,
  variables: null,
  delaySeconds: 0,
  help: false,
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  switch (arg) {
    case '-n':
    case '--requests':
      config.requests = parseInt(args[++i], 10);
      break;
    case '-c':
    case '--concurrency':
      config.concurrency = parseInt(args[++i], 10);
      break;
    case '-t':
    case '--template':
      config.templateId = args[++i];
      break;
    case '-ch':
    case '--channels':
      config.channels = args[++i].split(',').map(s => s.trim());
      break;
    case '-p':
    case '--providers':
      config.providers = args[++i].split(',').map(s => s.trim());
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
    case '-u':
    case '--url':
      config.baseUrl = args[++i];
      break;
    case '-k':
    case '--key':
      config.apiKey = args[++i];
      break;
    case '-h':
    case '--host':
      config.hostType = args[++i];
      break;
    case '-w':
    case '--webhook':
      config.webhookUrl = args[++i];
      break;
    case '-v':
    case '--variables':
      try {
        config.variables = JSON.parse(args[++i]);
      } catch (err) {
        console.error('❌ Error: --variables must be valid JSON.');
        process.exit(1);
      }
      break;
    case '-d':
    case '--delay':
      config.delaySeconds = parseInt(args[++i], 10);
      break;
    case '--help':
      config.help = true;
      break;
    default:
      // Positional args fallback: [requests] [concurrency]
      if (!isNaN(parseInt(arg, 10)) && i === 0) config.requests = parseInt(arg, 10);
      else if (!isNaN(parseInt(arg, 10)) && i === 1) config.concurrency = parseInt(arg, 10);
  }
}

if (config.help) {
  console.log(`
Usage: node scripts/load-test.js [options]

Options:
  -n, --requests <number>     Total requests (default: 1)
  -c, --concurrency <number>  Concurrency (default: 1)
  -t, --template <id>         Template ID
  -ch, --channels <list>      Comma-separated channels (e.g. mock,email)
  -p, --providers <list>      Comma-separated providers (e.g. mock,mock-fb)
  -to, --to <id/email>        Recipient ID or Email
  -s, --subject <string>      Subject (email)
  -m, --message <string>      Message body
  -u, --url <url>             Base API URL (default: http://localhost:3000)
  -k, --key <string>          API Key (Bearer authorization)
  -h, --host <type>           Webhook host (local/docker)
  -w, --webhook <url>         Custom webhook URL
  -v, --variables <json>      Template variables JSON
  -d, --delay <seconds>       Schedule delay in seconds
  `);
  process.exit(0);
}

// Determine Webhook Target URL
let webhookUrl = config.webhookUrl;
if (!webhookUrl) {
  const host = config.hostType === 'docker' ? 'host.docker.internal' : (config.hostType === 'local' ? 'localhost' : config.hostType);
  webhookUrl = `http://${host}:4000/webhook`;
}

// Axios Client instance with connection pooling
const apiClient = axios.create({
  baseURL: config.baseUrl,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
  },
  httpAgent,
  httpsAgent,
  timeout: 30000,
  validateStatus: () => true, // Don't throw on HTTP error codes so we can report status
});

// --- Payload Generator conforming to baseNotificationRequestSchema ---
const createPayload = () => {
  const recipient = {
    user_id: 'user_' + Math.floor(Math.random() * 10000),
  };

  if (config.to.includes('@')) {
    recipient.email = config.to;
  } else if (/^\+?\d+$/.test(config.to)) {
    recipient.phone_number = config.to;
  } else {
    recipient.user_id = config.to;
  }

  const payload = {
    request_id: randomUUID(),
    client_id: randomUUID(),
    client_name: 'load-test-script',
    channel: config.channels,
    recipient,
    webhook_url: webhookUrl,
  };

  if (config.providers.length > 0) {
    payload.provider = config.providers;
  }

  if (config.templateId) {
    payload.template_id = [config.templateId];
    if (config.variables) {
      payload.variables = config.variables;
    }
  } else {
    payload.content = {};
    config.channels.forEach(ch => {
      if (ch === 'email') {
        payload.content.email = {
          subject: config.subject,
          message: config.message,
        };
      } else {
        payload.content[ch] = {
          message: config.message,
        };
      }
    });
  }

  if (config.delaySeconds > 0) {
    payload.scheduled_at = new Date(Date.now() + config.delaySeconds * 1000).toISOString();
  }

  return payload;
};

// --- Request Logic ---
const sendRequest = async (index) => {
  const start = Date.now();
  try {
    const payload = createPayload();
    const response = await apiClient.post('/api/notification', payload);
    const duration = Date.now() - start;
    const status = response.status;
    const isSuccess = status >= 200 && status < 300;

    return {
      index,
      status,
      duration,
      success: isSuccess,
      data: response.data,
      error: isSuccess ? null : (response.data?.message || `HTTP ${status}`),
    };
  } catch (err) {
    const duration = Date.now() - start;
    return {
      index,
      status: 0,
      duration,
      success: false,
      error: err.message,
      data: null,
    };
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
  console.log('🚀 SimpleNS Notification Client:');
  console.log(`   Endpoint:    ${config.baseUrl}/api/notification`);
  console.log(`   Mode:        ${config.requests > 1 ? 'Load Test' : 'Single Send'}`);
  console.log(`   Requests:    ${config.requests}`);
  console.log(`   Concurrency: ${config.concurrency}`);
  console.log(`   Channels:    ${config.channels.join(', ')}`);
  if (config.providers.length) console.log(`   Providers:   ${config.providers.join(', ')}`);
  if (config.templateId) console.log(`   Template:    ${config.templateId}`);
  console.log(`   Recipient:   ${config.to}`);
  console.log(`   Webhook:     ${webhookUrl}`);
  if (config.delaySeconds > 0) console.log(`   Delay:       ${config.delaySeconds}s (Scheduled)`);
  console.log('');

  const results = [];
  const startTime = Date.now();
  let completed = 0;

  for (let i = 0; i < config.requests; i += config.concurrency) {
    const batchSize = Math.min(config.concurrency, config.requests - i);
    const batchResults = await runBatch(i, batchSize);
    results.push(...batchResults);

    completed += batchSize;
    if (config.requests > 1) {
      const pct = Math.round((completed / config.requests) * 100);
      process.stdout.write(`\r⏳ Progress: ${completed}/${config.requests} (${pct}%)`);
    }
  }

  const totalTime = Date.now() - startTime;

  // --- Reporting ---
  if (config.requests === 1) {
    const result = results[0];
    console.log('\n📊 Result:');
    if (result.success) {
      console.log('   ✅ Success');
      console.log(`   Status:   ${result.status}`);
      console.log(`   Duration: ${result.duration}ms`);
      if (result.data) console.log('   Response:', JSON.stringify(result.data, null, 2));
    } else {
      console.log('   ❌ Request Failed');
      console.log(`   Status:   ${result.status}`);
      console.log(`   Error:    ${result.error}`);
      if (result.data) console.log('   Details:', JSON.stringify(result.data, null, 2));
      if (result.status === 401) console.log('   💡 Hint: Check your NS_API_KEY (-k flag or .env).');
      if (result.status === 404) console.log('   💡 Hint: Check the API URL (-u flag).');
    }
  } else {
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const durations = results.map(r => r.duration).sort((a, b) => a - b);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const minDuration = durations[0];
    const maxDuration = durations[durations.length - 1];
    const p50 = durations[Math.floor(durations.length * 0.50)];
    const p95 = durations[Math.floor(durations.length * 0.95)];
    const p99 = durations[Math.floor(durations.length * 0.99)];
    const requestsPerSecond = (config.requests / (totalTime / 1000)).toFixed(2);

    const statusCodes = {};
    const sampleErrors = [];
    results.forEach(r => {
      statusCodes[r.status] = (statusCodes[r.status] || 0) + 1;
      if (!r.success && sampleErrors.length < 3 && r.error) {
        sampleErrors.push(`[HTTP ${r.status}] ${r.error}`);
      }
    });

    console.log('\n\n📊 Load Test Results:');
    console.log('─'.repeat(45));
    console.log(`   Total Time:     ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
    console.log(`   Throughput:     ${requestsPerSecond} req/sec`);
    console.log(`   Successful:     ${successful} ✅`);
    console.log(`   Failed:         ${failed} ${failed > 0 ? '❌' : ''}`);
    console.log('');
    console.log('⏱️  Latency Distribution:');
    console.log(`   Min:            ${minDuration}ms`);
    console.log(`   Avg:            ${avgDuration.toFixed(2)}ms`);
    console.log(`   p50 (Median):   ${p50}ms`);
    console.log(`   p95:            ${p95}ms`);
    console.log(`   p99:            ${p99}ms`);
    console.log(`   Max:            ${maxDuration}ms`);
    console.log('');
    console.log('📈 HTTP Status Codes:');
    Object.entries(statusCodes).sort().forEach(([code, count]) => {
      console.log(`   ${code}: ${count}`);
    });

    if (sampleErrors.length > 0) {
      console.log('\n⚠️  Sample Error Messages:');
      sampleErrors.forEach(e => console.log(`   - ${e}`));
    }
  }
};

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});

