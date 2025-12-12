import { CodeBlock } from "@/components/docs/code-block";
import { DocsCallout } from "@/components/docs/docs-callout";
import { DocsTable } from "@/components/docs/docs-table";
import { DocsNavGrid } from "@/components/docs/docs-nav-grid";
import { DocsTableOfContents } from "@/components/docs/docs-toc";

export default function ConfigurationPage() {
    return (
        <div className="space-y-10">
            <section>
                <h1 className="text-4xl font-bold tracking-tight mb-4">Configuration</h1>
                <p className="text-xl text-muted-foreground">
                    Configure SimpleNS using environment variables for API keys, email providers,
                    rate limiting, and more.
                </p>
            </section>

            <DocsTableOfContents
                items={[
                    { id: "overview", label: "Overview" },
                    { id: "api-server", label: "API Server" },
                    { id: "kafka", label: "Kafka" },
                    { id: "redis", label: "Redis" },
                    { id: "worker", label: "Background Worker" },
                    { id: "email", label: "Email (SMTP)" },
                    { id: "rate-limiting", label: "Rate Limiting" },
                    { id: "retry", label: "Retry Configuration" },
                    { id: "delayed", label: "Delayed Processor" },
                    { id: "recovery", label: "Recovery Cron" },
                    { id: "logging", label: "Logging" },
                    { id: "dashboard", label: "Admin Dashboard" },
                    { id: "example", label: "Example Configuration" },
                ]}
            />
            {/* Overview */}
            <section id="overview">
                <h2 className="text-2xl font-bold mb-4">Overview</h2>
                <p className="text-muted-foreground mb-4">
                    All configuration is done via environment variables. Copy <code className="px-1.5 py-0.5 bg-muted rounded">.env.example</code>
                    to <code className="px-1.5 py-0.5 bg-muted rounded">.env</code> and configure your settings.
                </p>
                <CodeBlock language="bash">
                    {`cp .env.example .env`}
                </CodeBlock>
            </section>

            {/* API Server Configuration */}
            <section id="api-server">
                <h2 className="text-2xl font-bold mb-4">API Server</h2>
                <DocsTable
                    headers={["Variable", "Description", "Default"]}
                    rows={[
                        [
                            <code key="api" className="text-xs">NS_API_KEY</code>,
                            "API authentication key (generate with openssl rand -base64 32)",
                            <span key="req" className="text-red-500 dark:text-red-400">Required</span>
                        ],
                        [
                            <code key="port" className="text-xs">PORT</code>,
                            "API server port",
                            <code key="port-val" className="text-xs">3000</code>
                        ],
                        [
                            <code key="mongo" className="text-xs">MONGO_URI</code>,
                            "MongoDB connection string",
                            <code key="mongo-val" className="text-xs text-nowrap">mongodb://127.0.0.1:27017/notification_service</code>
                        ],
                        [
                            <code key="batch" className="text-xs">MAX_BATCH_REQ_LIMIT</code>,
                            "Maximum batch request size (recipient × channel)",
                            <code key="batch-val" className="text-xs">1000</code>
                        ],
                    ]}
                />
            </section>

            {/* Kafka Configuration */}
            <section id="kafka">
                <h2 className="text-2xl font-bold mb-4">Kafka</h2>
                <DocsTable
                    headers={["Variable", "Description", "Default"]}
                    rows={[
                        [
                            <code key="brokers" className="text-xs">BROKERS</code>,
                            "Kafka broker list (comma-separated)",
                            <code key="brokers-val" className="text-xs">localhost:9092</code>
                        ],
                        [
                            <code key="email-part" className="text-xs">EMAIL_PARTITION</code>,
                            "Partitions for email_notification topic",
                            <code key="email-part-val" className="text-xs">1</code>
                        ],
                        [
                            <code key="wa-part" className="text-xs">WHATSAPP_PARTITION</code>,
                            "Partitions for whatsapp_notification topic",
                            <code key="wa-part-val" className="text-xs">1</code>
                        ],
                        [
                            <code key="delayed-part" className="text-xs">DELAYED_PARTITION</code>,
                            "Partitions for delayed_notification topic",
                            <code key="delayed-part-val" className="text-xs">1</code>
                        ],
                        [
                            <code key="status-part" className="text-xs">NOTIFICATION_STATUS_PARTITION</code>,
                            "Partitions for notification_status topic",
                            <code key="status-part-val" className="text-xs">1</code>
                        ],
                    ]}
                />
                <DocsCallout type="tip" title="Partition Scaling">
                    Increase partition counts to enable more consumer parallelism.
                    The number of partitions should match or exceed the number of processors.
                </DocsCallout>
            </section>

            {/* Redis Configuration */}
            <section id="redis">
                <h2 className="text-2xl font-bold mb-4">Redis</h2>
                <DocsTable
                    headers={["Variable", "Description", "Default"]}
                    rows={[
                        [
                            <code key="redis" className="text-xs">REDIS_URL</code>,
                            "Redis connection URL",
                            <code key="redis-val" className="text-xs">redis://localhost:6379</code>
                        ],
                    ]}
                />
            </section>

            {/* Background Worker Configuration */}
            <section id="worker">
                <h2 className="text-2xl font-bold mb-4">Background Worker</h2>
                <DocsTable
                    headers={["Variable", "Description", "Default"]}
                    rows={[
                        [
                            <code key="worker-id" className="text-xs">WORKER_ID</code>,
                            "Unique worker identifier (auto-generated if not set)",
                            <span key="worker-id-val" className="text-muted-foreground">Auto</span>
                        ],
                        [
                            <code key="poll" className="text-xs">OUTBOX_POLL_INTERVAL_MS</code>,
                            "Outbox poll interval in milliseconds",
                            <code key="poll-val" className="text-xs">5000</code>
                        ],
                        [
                            <code key="batch-size" className="text-xs">OUTBOX_BATCH_SIZE</code>,
                            "Number of entries to process per poll",
                            <code key="batch-size-val" className="text-xs">100</code>
                        ],
                        [
                            <code key="claim" className="text-xs">OUTBOX_CLAIM_TIMEOUT_MS</code>,
                            "Claim timeout before another worker can reclaim",
                            <code key="claim-val" className="text-xs">30000</code>
                        ],
                        [
                            <code key="cleanup" className="text-xs">OUTBOX_CLEANUP_INTERVAL_MS</code>,
                            "Cleanup interval for processed entries",
                            <code key="cleanup-val" className="text-xs">60000</code>
                        ],
                        [
                            <code key="retention" className="text-xs">OUTBOX_RETENTION_MS</code>,
                            "How long to keep published entries",
                            <code key="retention-val" className="text-xs">300000</code>
                        ],
                    ]}
                />
            </section>

            {/* Email Configuration */}
            <section id="email">
                <h2 className="text-2xl font-bold mb-4">Email (SMTP)</h2>
                <DocsTable
                    headers={["Variable", "Description", "Default"]}
                    rows={[
                        [
                            <code key="email-host" className="text-xs">EMAIL_HOST</code>,
                            "SMTP server host",
                            <code key="email-host-val" className="text-xs">smtp.gmail.com</code>
                        ],
                        [
                            <code key="email-port" className="text-xs">EMAIL_PORT</code>,
                            "SMTP server port (587 for TLS, 465 for SSL)",
                            <code key="email-port-val" className="text-xs">587</code>
                        ],
                        [
                            <code key="email-user" className="text-xs">EMAIL_USER</code>,
                            "SMTP username/email",
                            <span key="email-user-val" className="text-red-500 dark:text-red-400">Required</span>
                        ],
                        [
                            <code key="email-pass" className="text-xs">EMAIL_PASS</code>,
                            "SMTP password or app-specific password",
                            <span key="email-pass-val" className="text-red-500 dark:text-red-400">Required</span>
                        ],
                        [
                            <code key="email-from" className="text-xs">EMAIL_FROM</code>,
                            "Sender email address",
                            <span key="email-from-val" className="text-muted-foreground">Defaults to EMAIL_USER</span>
                        ],
                    ]}
                />

                <h3 className="text-lg font-semibold mb-3 mt-6">Gmail Setup</h3>
                <p className="text-muted-foreground mb-4">
                    To use Gmail as your SMTP provider:
                </p>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground mb-4">
                    <li>Enable 2-Factor Authentication on your Google account</li>
                    <li>Go to <a href="https://myaccount.google.com/apppasswords" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Google App Passwords</a></li>
                    <li>Generate an App Password for &quot;Mail&quot;</li>
                    <li>Use the generated password as <code className="px-1.5 py-0.5 bg-muted rounded">EMAIL_PASS</code></li>
                </ol>
                <DocsCallout type="warning" title="Gmail Sending Limits">
                    Gmail has daily sending limits (500 emails for personal, 2000 for Workspace).
                    For high-volume sending, consider a dedicated email service.
                </DocsCallout>
            </section>

            {/* Rate Limiting */}
            <section id="rate-limiting">
                <h2 className="text-2xl font-bold mb-4">Rate Limiting</h2>
                <p className="text-muted-foreground mb-4">
                    SimpleNS uses a token bucket algorithm to rate limit outgoing notifications
                    and prevent provider throttling.
                </p>
                <DocsTable
                    headers={["Variable", "Description", "Default"]}
                    rows={[
                        [
                            <code key="email-tokens" className="text-xs">EMAIL_RATE_LIMIT_TOKENS</code>,
                            "Max tokens in bucket for email",
                            <code key="email-tokens-val" className="text-xs">100</code>
                        ],
                        [
                            <code key="email-refill" className="text-xs">EMAIL_RATE_LIMIT_REFILL_RATE</code>,
                            "Tokens added per second for email",
                            <code key="email-refill-val" className="text-xs">10</code>
                        ],
                        [
                            <code key="wa-tokens" className="text-xs">WHATSAPP_RATE_LIMIT_TOKENS</code>,
                            "Max tokens in bucket for WhatsApp",
                            <code key="wa-tokens-val" className="text-xs">50</code>
                        ],
                        [
                            <code key="wa-refill" className="text-xs">WHATSAPP_RATE_LIMIT_REFILL_RATE</code>,
                            "Tokens added per second for WhatsApp",
                            <code key="wa-refill-val" className="text-xs">5</code>
                        ],
                    ]}
                />
                <DocsCallout type="note" title="Token Bucket Algorithm">
                    Each notification consumes one token. If the bucket is empty, the processor
                    waits until tokens refill. This smooths out burst traffic.
                </DocsCallout>
            </section>

            {/* Retry Configuration */}
            <section id="retry">
                <h2 className="text-2xl font-bold mb-4">Retry Configuration</h2>
                <DocsTable
                    headers={["Variable", "Description", "Default"]}
                    rows={[
                        [
                            <code key="max-retry" className="text-xs">MAX_RETRY_COUNT</code>,
                            "Maximum retries before marking as failed",
                            <code key="max-retry-val" className="text-xs">5</code>
                        ],
                        [
                            <code key="idempotency" className="text-xs">IDEMPOTENCY_TTL_SECONDS</code>,
                            "How long to keep idempotency keys in Redis",
                            <code key="idempotency-val" className="text-xs">86400</code>
                        ],
                        [
                            <code key="processing" className="text-xs">PROCESSING_TTL_SECONDS</code>,
                            "How long a processing lock is held",
                            <code key="processing-val" className="text-xs">120</code>
                        ],
                    ]}
                />
            </section>

            {/* Delayed Processor */}
            <section id="delayed">
                <h2 className="text-2xl font-bold mb-4">Delayed Processor</h2>
                <DocsTable
                    headers={["Variable", "Description", "Default"]}
                    rows={[
                        [
                            <code key="delayed-poll" className="text-xs">DELAYED_POLL_INTERVAL_MS</code>,
                            "Poll interval for due events",
                            <code key="delayed-poll-val" className="text-xs">1000</code>
                        ],
                        [
                            <code key="delayed-batch" className="text-xs">DELAYED_BATCH_SIZE</code>,
                            "Number of due events to fetch per poll",
                            <code key="delayed-batch-val" className="text-xs">10</code>
                        ],
                        [
                            <code key="max-poller" className="text-xs">MAX_POLLER_RETRIES</code>,
                            "Max retries for poller before sending to DLQ",
                            <code key="max-poller-val" className="text-xs">3</code>
                        ],
                        [
                            <code key="claim-timeout" className="text-xs">DELAYED_CLAIM_TIMEOUT_MS</code>,
                            "How long a claimed event stays locked",
                            <code key="claim-timeout-val" className="text-xs">30000</code>
                        ],
                    ]}
                />
            </section>

            {/* Recovery Cron */}
            <section id="recovery">
                <h2 className="text-2xl font-bold mb-4">Recovery Cron</h2>
                <p className="text-muted-foreground mb-4">
                    The recovery cron detects and reconciles inconsistencies between MongoDB and Redis,
                    ensuring exactly-once delivery guarantees even after worker crashes.
                </p>
                <DocsTable
                    headers={["Variable", "Description", "Default"]}
                    rows={[
                        [
                            <code key="recovery-interval" className="text-xs">RECOVERY_CRON_INTERVAL_MS</code>,
                            "How often the recovery cron runs (in milliseconds)",
                            <code key="recovery-interval-val" className="text-xs">120000</code>
                        ],
                        [
                            <code key="recovery-batch" className="text-xs">RECOVERY_BATCH_SIZE</code>,
                            "Batch size for processing stuck notifications",
                            <code key="recovery-batch-val" className="text-xs">50</code>
                        ],
                        [
                            <code key="orphan-threshold" className="text-xs">ORPHAN_THRESHOLD_MS</code>,
                            "Time after which pending notifications are considered orphaned",
                            <code key="orphan-threshold-val" className="text-xs">300000</code>
                        ],
                        [
                            <code key="orphan-alert" className="text-xs">ORPHAN_ALERT_THRESHOLD</code>,
                            "Orphaned count to trigger warning alert",
                            <code key="orphan-alert-val" className="text-xs">5</code>
                        ],
                        [
                            <code key="orphan-critical" className="text-xs">ORPHAN_CRITICAL_THRESHOLD</code>,
                            "Orphaned count to trigger critical alert",
                            <code key="orphan-critical-val" className="text-xs">10</code>
                        ],
                    ]}
                />
            </section>

            {/* Logging */}
            <section id="logging">
                <h2 className="text-2xl font-bold mb-4">Logging</h2>
                <DocsTable
                    headers={["Variable", "Description", "Default"]}
                    rows={[
                        [
                            <code key="loki" className="text-xs">LOKI_URL</code>,
                            "Grafana Loki URL for log aggregation",
                            <code key="loki-val" className="text-xs">http://loki:3100</code>
                        ],
                        [
                            <code key="log-level" className="text-xs">LOG_LEVEL</code>,
                            "Minimum log level (debug, info, warn, error)",
                            <code key="log-level-val" className="text-xs">info</code>
                        ],
                        [
                            <code key="log-file" className="text-xs">LOG_TO_FILE</code>,
                            "Enable file logging",
                            <code key="log-file-val" className="text-xs">true</code>
                        ],
                    ]}
                />
            </section>

            {/* Admin Dashboard */}
            <section id="dashboard">
                <h2 className="text-2xl font-bold mb-4">Admin Dashboard</h2>
                <p className="text-muted-foreground mb-4">
                    The dashboard is a separate Next.js application with its own environment file
                    (<code className="px-1.5 py-0.5 bg-muted rounded">dashboard/.env</code>).
                </p>
                <DocsTable
                    headers={["Variable", "Description", "Default"]}
                    rows={[
                        [
                            <code key="auth-secret" className="text-xs">AUTH_SECRET</code>,
                            "NextAuth session encryption secret (generate with openssl rand -base64 32)",
                            <span key="auth-secret-val" className="text-red-500 dark:text-red-400">Required</span>
                        ],
                        [
                            <code key="admin-user" className="text-xs">ADMIN_USERNAME</code>,
                            "Dashboard login username",
                            <code key="admin-user-val" className="text-xs">admin</code>
                        ],
                        [
                            <code key="admin-pass" className="text-xs">ADMIN_PASSWORD</code>,
                            "Dashboard login password",
                            <code key="admin-pass-val" className="text-xs">admin</code>
                        ],
                        [
                            <code key="dash-port" className="text-xs">PORT</code>,
                            "Dashboard server port",
                            <code key="dash-port-val" className="text-xs">3002</code>
                        ],
                        [
                            <code key="dash-mongo" className="text-xs">MONGO_URI</code>,
                            "MongoDB connection string (direct access for retries)",
                            <span key="dash-mongo-val" className="text-red-500 dark:text-red-400">Required</span>
                        ],
                        [
                            <code key="ns-api-key" className="text-xs">NS_API_KEY</code>,
                            "API key for calling notification service",
                            <span key="ns-api-key-val" className="text-red-500 dark:text-red-400">Required</span>
                        ],
                        [
                            <code key="api-base" className="text-xs">API_BASE_URL</code>,
                            "Notification service base URL",
                            <code key="api-base-val" className="text-xs">http://localhost:3000</code>
                        ],
                        [
                            <code key="webhook-host" className="text-xs">WEBHOOK_HOST</code>,
                            "Webhook server host for test notifications",
                            <code key="webhook-host-val" className="text-xs">localhost</code>
                        ],
                        [
                            <code key="webhook-port" className="text-xs">WEBHOOK_PORT</code>,
                            "Webhook server port for test notifications",
                            <code key="webhook-port-val" className="text-xs">4000</code>
                        ],
                    ]}
                />
                <DocsCallout type="warning" title="Security">
                    Always change the default dashboard credentials in production!
                </DocsCallout>
            </section>

            {/* Example .env */}
            <section id="example">
                <h2 className="text-2xl font-bold mb-4">Example Configuration</h2>
                <p className="text-muted-foreground mb-4">
                    Here&apos;s a minimal <code className="px-1.5 py-0.5 bg-muted rounded">.env</code> file for local development:
                </p>
                <CodeBlock language="bash" filename=".env">
                    {`# API Server
NS_API_KEY=your-secure-api-key-here
PORT=3000

# Database
MONGO_URI=mongodb://127.0.0.1:27017/notification_service?replicaSet=rs0

# Redis
REDIS_URL=redis://localhost:6379

# Kafka
BROKERS=localhost:9092

# Email (Gmail example)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com

# Rate Limiting
EMAIL_RATE_LIMIT_TOKENS=100
EMAIL_RATE_LIMIT_REFILL_RATE=10

# Retry
MAX_RETRY_COUNT=5

# Logging
LOG_LEVEL=info

# Dashboard
AUTH_SECRET=your-auth-secret-here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=secure-password`}
                </CodeBlock>
            </section>
            <DocsNavGrid
                items={[
                    { link: "/docs/scaling", heading: "Scaling", subtitle: "Horizontal scaling and high throughput" },
                    { link: "/docs/monitoring", heading: "Monitoring", subtitle: "Set up logging and observability" },
                    { link: "/docs/admin-dashboard", heading: "Admin Dashboard", subtitle: "Admin dashboard configuration" },
                ]}
            />
        </div>
    );
}
