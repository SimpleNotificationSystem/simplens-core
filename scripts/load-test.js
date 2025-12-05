/**
 * Load test script for /notification endpoint
 * Generates unique request_id for each request
 * 
 * Usage: node scripts/load-test.js [requests] [concurrency]
 * Example: node scripts/load-test.js 1000 100
 */

import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const NS_API_KEY = process.env.NS_API_KEY || '4YCItWcuH2qJe3bXM9LbsbqefflWFlXlzvneMRSSQhU=';

const TOTAL_REQUESTS = parseInt(process.argv[2] || '1000');
const CONCURRENCY = parseInt(process.argv[3] || '50');

const createPayload = () => ({
  request_id: randomUUID(),
  client_id: "5f2c1d77-8a4b-4a5a-9b1c-2c3d4e5f6a7b",
  channel: ["whatsapp"],
  recipient: {
    user_id: "user_12345",
    phone: "+15551234567"
  },
  content: {
    whatsapp: {
      message: "Thanks for signing up! Reply HELP for assistance."
    }
  },
  webhook_url: "https://yourapp.example.com/notifications/webhook",
  retry_count: 0
});

const sendRequest = async (index) => {
    const start = Date.now();
    try {
        const response = await fetch(`${BASE_URL}/notification`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${NS_API_KEY}`
            },
            body: JSON.stringify(createPayload())
        });
        
        const duration = Date.now() - start;
        const status = response.status;
        
        return { index, status, duration, success: status >= 200 && status < 300 };
    } catch (err) {
        const duration = Date.now() - start;
        return { index, status: 0, duration, success: false, error: err.message };
    }
};

const runBatch = async (startIndex, batchSize) => {
    const promises = [];
    for (let i = 0; i < batchSize; i++) {
        promises.push(sendRequest(startIndex + i));
    }
    return Promise.all(promises);
};

const main = async () => {
    console.log('🚀 Load Test Configuration:');
    console.log(`   URL: ${BASE_URL}/notification`);
    console.log(`   Total Requests: ${TOTAL_REQUESTS}`);
    console.log(`   Concurrency: ${CONCURRENCY}`);
    console.log('');

    const results = [];
    const startTime = Date.now();
    let completed = 0;

    // Process in batches
    for (let i = 0; i < TOTAL_REQUESTS; i += CONCURRENCY) {
        const batchSize = Math.min(CONCURRENCY, TOTAL_REQUESTS - i);
        const batchResults = await runBatch(i, batchSize);
        results.push(...batchResults);
        
        completed += batchSize;
        process.stdout.write(`\r⏳ Progress: ${completed}/${TOTAL_REQUESTS} (${Math.round(completed/TOTAL_REQUESTS*100)}%)`);
    }

    const totalTime = Date.now() - startTime;
    
    // Calculate stats
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const durations = results.map(r => r.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    const requestsPerSecond = (TOTAL_REQUESTS / totalTime) * 1000;

    // Status code breakdown
    const statusCodes = {};
    results.forEach(r => {
        statusCodes[r.status] = (statusCodes[r.status] || 0) + 1;
    });

    console.log('\n\n📊 Results:');
    console.log('─'.repeat(40));
    console.log(`   Total Time:     ${totalTime}ms (${(totalTime/1000).toFixed(2)}s)`);
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
};

main().catch(console.error);
