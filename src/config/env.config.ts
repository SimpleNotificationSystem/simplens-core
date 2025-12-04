import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

// Unique worker ID for this instance (used for distributed locking)
const WORKER_ID = process.env.WORKER_ID || `worker-${randomUUID().slice(0, 8)}`;

export const env = {
    // Database
    MONGO_URI: <string>process.env.MONGO_URI || "mongodb://127.0.0.1:27017/notification_service",
    
    // API Server
    PORT: <number>parseInt(process.env.PORT || "3000"),
    NS_API_KEY: <string>process.env.NS_API_KEY || "4YCItWcuH2qJe3bXM9LbsbqefflWFlXlzvneMRSSQhU=",
    MAX_BATCH_REQ_LIMIT: <number>parseInt(process.env.MAX_BATCH_REQ_LIMIT || "1000"),
    
    // Kafka
    BROKERS: <string[]>(process.env.BROKERS?.trim().split(',') || ["localhost:9092"]),
    
    // Background Worker
    WORKER_ID,
    OUTBOX_POLL_INTERVAL_MS: <number>parseInt(process.env.OUTBOX_POLL_INTERVAL_MS || "5000"),
    OUTBOX_CLEANUP_INTERVAL_MS: <number>parseInt(process.env.OUTBOX_CLEANUP_INTERVAL_MS || "60000"),
    OUTBOX_BATCH_SIZE: <number>parseInt(process.env.OUTBOX_BATCH_SIZE || "100"),
    OUTBOX_RETENTION_MS: <number>parseInt(process.env.OUTBOX_RETENTION_MS || "300000"),
    // Claim timeout: if a worker claims an event but crashes, another worker can reclaim after this time
    OUTBOX_CLAIM_TIMEOUT_MS: <number>parseInt(process.env.OUTBOX_CLAIM_TIMEOUT_MS || "30000"),
}