import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { dynamicConfig } from './dynamic-config.service.js';

dotenv.config();

// Unique worker/processor ID for this instance (used for distributed locking)
const WORKER_ID = process.env.WORKER_ID || `worker-${randomUUID().slice(0, 8)}`;

export const env = {
    // ========================================================================
    // 1. BOOTSTRAP ENVIRONMENT VARIABLES (from .env / process.env)
    // ========================================================================

    // Node Environment
    NODE_ENV: <string>process.env.NODE_ENV || 'development',

    // Database
    MONGO_URI: <string>process.env.MONGO_URI || "mongodb://127.0.0.1:27017/notification_service",

    // Redis
    REDIS_URL: <string>process.env.REDIS_URL || "redis://localhost:6379",

    // API Server
    PORT: <number>parseInt(process.env.PORT || "3000"),
    NS_API_KEY: <string>(process.env.NS_API_KEY || ""),
    DELAYED_PARTITION: <number>parseInt(process.env.DELAYED_PARTITION || "1"),
    NOTIFICATION_STATUS_PARTITION: <number>parseInt(process.env.NOTIFICATION_STATUS_PARTITION || "1"),

    // Kafka
    BROKERS: <string[]>(process.env.BROKERS?.trim().split(',') || ["localhost:9092"]),

    // Distributed Worker Identity
    WORKER_ID,

    // Logging - Grafana Loki
    LOKI_URL: <string>process.env.LOKI_URL || "",

    // Admin Alerts (optional - auto-generated if not provided)
    ADMIN_ALERT_ENCRYPTION_KEY: <string>process.env.ADMIN_ALERT_ENCRYPTION_KEY || "",

    // ========================================================================
    // 2. DYNAMIC OPERATIONAL VARIABLES (Delegated to DynamicConfigService)
    // These reflect live in-memory MongoDB configuration with zero-restart updates.
    // ========================================================================

    // API
    get MAX_BATCH_REQ_LIMIT(): number {
        return dynamicConfig?.get?.('api')?.max_batch_req_limit ?? 1000;
    },

    // Background Worker
    get OUTBOX_POLL_INTERVAL_MS(): number {
        return dynamicConfig?.get?.('worker')?.outbox_poll_interval_ms ?? 5000;
    },
    get OUTBOX_CLEANUP_INTERVAL_MS(): number {
        return dynamicConfig?.get?.('worker')?.outbox_cleanup_interval_ms ?? 60000;
    },
    get OUTBOX_BATCH_SIZE(): number {
        return dynamicConfig?.get?.('worker')?.outbox_batch_size ?? 100;
    },
    get OUTBOX_RETENTION_MS(): number {
        return dynamicConfig?.get?.('worker')?.outbox_retention_ms ?? 300000;
    },
    get OUTBOX_CLAIM_TIMEOUT_MS(): number {
        return dynamicConfig?.get?.('worker')?.outbox_claim_timeout_ms ?? 30000;
    },

    // Idempotency & Retry
    get IDEMPOTENCY_TTL_SECONDS(): number {
        return dynamicConfig?.get?.('retry')?.idempotency_ttl_seconds ?? 86400;
    },
    get MAX_RETRY_COUNT(): number {
        return dynamicConfig?.get?.('retry')?.max_retry_count ?? 5;
    },
    get PROCESSING_TTL_SECONDS(): number {
        return dynamicConfig?.get?.('retry')?.processing_ttl_seconds ?? 120;
    },
    get RATE_LIMIT_RETRY_DELAY_MS(): number {
        return dynamicConfig?.get?.('retry')?.rate_limit_retry_delay_ms ?? 5000;
    },

    // Delayed Worker
    get MAX_POLLER_RETRIES(): number {
        return dynamicConfig?.get?.('delayed')?.max_poller_retries ?? 3;
    },
    get DELAYED_POLL_INTERVAL_MS(): number {
        return dynamicConfig?.get?.('delayed')?.delayed_poll_interval_ms ?? 1000;
    },
    get DELAYED_BATCH_SIZE(): number {
        return dynamicConfig?.get?.('delayed')?.delayed_batch_size ?? 10;
    },

    // Recovery Service
    get RECOVERY_POLL_INTERVAL_MS(): number {
        return dynamicConfig?.get?.('recovery')?.recovery_poll_interval_ms ?? 60000;
    },
    get PROCESSING_STUCK_THRESHOLD_MS(): number {
        return dynamicConfig?.get?.('recovery')?.processing_stuck_threshold_ms ?? 300000;
    },
    get PENDING_STUCK_THRESHOLD_MS(): number {
        return dynamicConfig?.get?.('recovery')?.pending_stuck_threshold_ms ?? 300000;
    },
    get RECOVERY_BATCH_SIZE(): number {
        return dynamicConfig?.get?.('recovery')?.recovery_batch_size ?? 50;
    },
    get RECOVERY_CLAIM_TIMEOUT_MS(): number {
        return dynamicConfig?.get?.('recovery')?.recovery_claim_timeout_ms ?? 60000;
    },
    get CLEANUP_RESOLVED_ALERTS_RETENTION_MS(): number {
        return dynamicConfig?.get?.('recovery')?.cleanup_resolved_alerts_retention_ms ?? 86400000;
    },
    get CLEANUP_PROCESSED_STATUS_OUTBOX_RETENTION_MS(): number {
        return dynamicConfig?.get?.('recovery')?.cleanup_processed_status_outbox_retention_ms ?? 86400000;
    },

    // Logging
    get LOG_LEVEL(): string {
        return dynamicConfig?.get?.('logging')?.log_level ?? (process.env.LOG_LEVEL || 'info');
    },
    get LOG_TO_FILE(): boolean {
        return dynamicConfig?.get?.('logging')?.log_to_file ?? (process.env.LOG_TO_FILE === 'true');
    },
};