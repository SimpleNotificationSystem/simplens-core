import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

// Unique worker/processor ID for this instance (used for distributed locking)
const WORKER_ID = process.env.WORKER_ID || `worker-${randomUUID().slice(0, 8)}`;

export const env = {
    // Node Environment
    NODE_ENV: <string>process.env.NODE_ENV || 'development',
    
    // Database
    MONGO_URI: <string>process.env.MONGO_URI || "mongodb://127.0.0.1:27017/notification_service",
    
    // Redis
    REDIS_URL: <string>process.env.REDIS_URL || "redis://localhost:6379",
    
    // API Server
    PORT: <number>parseInt(process.env.PORT || "3000"),
    NS_API_KEY: <string>(process.env.NS_API_KEY || ""),
    MAX_BATCH_REQ_LIMIT: <number>parseInt(process.env.MAX_BATCH_REQ_LIMIT || "1000"),
    EMAIL_PARTITION:<number>parseInt(process.env.EMAIL_PARTITION || "1"),
    WHATSAPP_PARTITION:<number>parseInt(process.env.WHATSAPP_PARTITION || "1"),
    DELAYED_PARTITION:<number>parseInt(process.env.DELAYED_PARTITION || "1"),
    NOTIFICATION_STATUS_PARTITION:<number>parseInt(process.env.NOTIFICATION_STATUS_PARTITION || "1"),
    
    // Kafka
    BROKERS: <string[]>(process.env.BROKERS?.trim().split(',') || ["localhost:9092"]),
    
    // Background Worker
    WORKER_ID,
    OUTBOX_POLL_INTERVAL_MS: <number>parseInt(process.env.OUTBOX_POLL_INTERVAL_MS || "5000"),
    OUTBOX_CLEANUP_INTERVAL_MS: <number>parseInt(process.env.OUTBOX_CLEANUP_INTERVAL_MS || "60000"),
    OUTBOX_BATCH_SIZE: <number>parseInt(process.env.OUTBOX_BATCH_SIZE || "100"),
    OUTBOX_RETENTION_MS: <number>parseInt(process.env.OUTBOX_RETENTION_MS || "300000"),
    OUTBOX_CLAIM_TIMEOUT_MS: <number>parseInt(process.env.OUTBOX_CLAIM_TIMEOUT_MS || "30000"),
    
    // Email Configuration (Gmail SMTP)
    EMAIL_HOST: <string>process.env.EMAIL_HOST || "smtp.gmail.com",
    EMAIL_PORT: <number>parseInt(process.env.EMAIL_PORT || "587"),
    EMAIL_USER: <string>process.env.EMAIL_USER || "",
    EMAIL_PASS: <string>process.env.EMAIL_PASS || "",
    EMAIL_FROM: <string>process.env.EMAIL_FROM || process.env.EMAIL_USER || "",
    
    // Rate Limiting - Token Bucket
    EMAIL_RATE_LIMIT_TOKENS: <number>parseInt(process.env.EMAIL_RATE_LIMIT_TOKENS || "100"),
    EMAIL_RATE_LIMIT_REFILL_RATE: <number>parseInt(process.env.EMAIL_RATE_LIMIT_REFILL_RATE || "10"),
    WHATSAPP_RATE_LIMIT_TOKENS: <number>parseInt(process.env.WHATSAPP_RATE_LIMIT_TOKENS || "50"),
    WHATSAPP_RATE_LIMIT_REFILL_RATE: <number>parseInt(process.env.WHATSAPP_RATE_LIMIT_REFILL_RATE || "5"),
    
    // Idempotency & Retry
    IDEMPOTENCY_TTL_SECONDS: <number>parseInt(process.env.IDEMPOTENCY_TTL_SECONDS || "86400"),
    MAX_RETRY_COUNT: <number>parseInt(process.env.MAX_RETRY_COUNT || "5"),
    PROCESSING_TTL_SECONDS: <number>parseInt(process.env.PROCESSING_TTL_SECONDS || "120"),

    // Delayed Worker
    MAX_POLLER_RETRIES: <number>parseInt(process.env.MAX_POLLER_RETRIES || "3"),
    DELAYED_POLL_INTERVAL_MS: <number>parseInt(process.env.DELAYED_POLL_INTERVAL_MS || "1000"),
    DELAYED_BATCH_SIZE: <number>parseInt(process.env.DELAYED_BATCH_SIZE || "10"),
    
    // Logging - Grafana Loki
    LOKI_URL: <string>process.env.LOKI_URL || "",
    LOG_LEVEL: <string>process.env.LOG_LEVEL || "info",
    LOG_TO_FILE: process.env.LOG_TO_FILE === "true",
}