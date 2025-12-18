import Image from "next/image";
import { DocsCallout } from "@/components/docs/docs-callout";
import { DocsTable } from "@/components/docs/docs-table";
import { DocsNavGrid } from "@/components/docs/docs-nav-grid";
import { DocsTableOfContents } from "@/components/docs/docs-toc";

export default function ArchitecturePage() {
    return (
        <div className="space-y-12">
            {/* Header */}
            <section>
                <h1 className="text-4xl font-bold tracking-tight mb-4">Architecture</h1>
                <p className="text-xl text-muted-foreground">
                    Deep dive into SimpleNS system design — how maximum delivery is guaranteed,
                    race conditions are handled, and the system scales horizontally.
                </p>
            </section>

            {/* Table of Contents */}
            <DocsTableOfContents
                items={[
                    { id: "high-level-design", label: "High-Level Design" },
                    { id: "mongodb-schema", label: "MongoDB Schema Design" },
                    { id: "transactional-outbox", label: "Transactional Outbox Pattern" },
                    { id: "race-conditions", label: "Handling Race Conditions" },
                    { id: "idempotency", label: "Idempotency" },
                    { id: "rate-limiting", label: "Rate Limiting" },
                    { id: "retry-logic", label: "Retry Logic" },
                    { id: "delayed-notifications", label: "Delayed/Scheduled Notifications" },
                    { id: "dlq", label: "Dead Letter Handling" },
                    { id: "status-webhooks", label: "Status Updates & Webhooks" },
                    { id: "kafka-topics", label: "Kafka Topics" },
                    { id: "recovery-service", label: "Recovery Service" },
                    { id: "graceful-shutdown", label: "Graceful Shutdown" },
                ]}
            />

            {/* High-Level Design */}
            <section id="high-level-design">
                <h2 className="text-2xl font-bold mb-4">High-Level Design</h2>
                <p className="text-muted-foreground mb-6">
                    SimpleNS follows an <strong className="text-foreground">event-driven architecture</strong> where
                    requests flow through multiple asynchronous stages. This design enables horizontal scaling,
                    fault tolerance, and decoupled processing.
                </p>

                <div className="rounded-lg border overflow-hidden bg-white dark:bg-zinc-900 p-4 mb-6">
                    <Image
                        src="/NotificationServiceHLD.png"
                        alt="SimpleNS High-Level Architecture Diagram"
                        width={1200}
                        height={600}
                        className="w-full h-auto"
                    />
                </div>

                <h3 className="text-lg font-semibold mb-3">Core Components</h3>
                <DocsTable
                    headers={["Component", "Responsibility"]}
                    rows={[
                        [
                            <strong key="api">API Server</strong>,
                            "Accepts notification requests, validates input, persists to MongoDB using transactional outbox pattern"
                        ],
                        [
                            <strong key="worker">Background Worker</strong>,
                            "Polls outbox, publishes to Kafka, consumes status updates, triggers webhook callbacks"
                        ],
                        [
                            <strong key="email">Email Processor</strong>,
                            "Consumes from Kafka, applies rate limiting and idempotency, delivers emails via SMTP"
                        ],
                        [
                            <strong key="whatsapp">WhatsApp Processor</strong>,
                            "Consumes from Kafka, applies rate limiting and idempotency, delivers via WhatsApp API"
                        ],
                        [
                            <strong key="delayed">Delayed Processor</strong>,
                            "Handles scheduled notifications and retries using Redis priority queue (ZSET)"
                        ],
                    ]}
                />

                <h3 className="text-lg font-semibold mb-3 mt-6">Infrastructure</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg border bg-card">
                        <h4 className="font-semibold mb-2">Apache Kafka</h4>
                        <p className="text-sm text-muted-foreground">Message broker for decoupled, asynchronous processing between services</p>
                    </div>
                    <div className="p-4 rounded-lg border bg-card">
                        <h4 className="font-semibold mb-2">MongoDB</h4>
                        <p className="text-sm text-muted-foreground">Primary data store for notifications and transactional outbox</p>
                    </div>
                    <div className="p-4 rounded-lg border bg-card">
                        <h4 className="font-semibold mb-2">Redis</h4>
                        <p className="text-sm text-muted-foreground">Rate limiting, idempotency checks, delayed queue (ZSET)</p>
                    </div>
                </div>
            </section>

            {/* MongoDB Schema Design */}
            <section id="mongodb-schema">
                <h2 className="text-2xl font-bold mb-4">MongoDB Schema Design</h2>

                <h3 className="text-lg font-semibold mb-3">Notification Collection</h3>
                <p className="text-muted-foreground mb-4">
                    Stores all notification records with their current status, delivery metadata, and error information.
                </p>
                <DocsTable
                    headers={["Field", "Type", "Description"]}
                    rows={[
                        [<code key="id" className="text-xs">_id</code>, "ObjectId", "Auto-generated MongoDB identifier"],
                        [<code key="req" className="text-xs">request_id</code>, "UUID v4", "Client-provided unique identifier per request"],
                        [<code key="client" className="text-xs">client_id</code>, "UUID v4", "Identifies the client application"],
                        [<code key="channel" className="text-xs">channel</code>, "Enum", "Delivery channel: email or whatsapp"],
                        [<code key="recipient" className="text-xs">recipient</code>, "Object", "Contains user_id, email, and/or phone"],
                        [<code key="content" className="text-xs">content</code>, "Object", "Email subject/message or WhatsApp message"],
                        [<code key="vars" className="text-xs">variables</code>, "Map", "Template variable substitutions"],
                        [<code key="webhook" className="text-xs">webhook_url</code>, "String", "URL for delivery status callbacks"],
                        [<code key="status" className="text-xs">status</code>, "Enum", "pending → processing → delivered/failed"],
                        [<code key="sched" className="text-xs">scheduled_at</code>, "Date", "Scheduled delivery time (optional)"],
                        [<code key="error" className="text-xs">error_message</code>, "String", "Last error message if failed"],
                        [<code key="retry" className="text-xs">retry_count</code>, "Number", "Number of delivery attempts"],
                    ]}
                />

                <h3 className="text-lg font-semibold mb-3 mt-6">Outbox Collection</h3>
                <p className="text-muted-foreground mb-4">
                    Implements the transactional outbox pattern for reliable event delivery to Kafka.
                </p>
                <DocsTable
                    headers={["Field", "Type", "Description"]}
                    rows={[
                        [<code key="nid" className="text-xs">notification_id</code>, "ObjectId (ref)", "Reference to notification document"],
                        [<code key="topic" className="text-xs">topic</code>, "Enum", "Target Kafka topic"],
                        [<code key="payload" className="text-xs">payload</code>, "Mixed", "Message payload for Kafka"],
                        [<code key="ostatus" className="text-xs">status</code>, "Enum", "pending → processing → published"],
                        [<code key="claimed" className="text-xs">claimed_by</code>, "String", "Worker ID that claimed this entry"],
                        [<code key="claimat" className="text-xs">claimed_at</code>, "Date", "When the worker claimed it"],
                    ]}
                />

                <h3 className="text-lg font-semibold mb-3 mt-6">Status Outbox Collection</h3>
                <p className="text-muted-foreground mb-4">
                    A minimal transactional outbox for publishing notification status updates to Kafka.
                    Used by the Recovery Service to ensure atomic status updates when recovering stuck notifications.
                </p>
                <DocsTable
                    headers={["Field", "Type", "Description"]}
                    rows={[
                        [<code key="so-nid" className="text-xs">notification_id</code>, "ObjectId (ref)", "Reference to the notification document"],
                        [<code key="so-status" className="text-xs">status</code>, "Enum", "Target status: delivered or failed"],
                        [<code key="so-processed" className="text-xs">processed</code>, "Boolean", "Whether the entry has been published to Kafka"],
                        [<code key="so-claimed" className="text-xs">claimed_by</code>, "String", "Worker ID that claimed this entry"],
                        [<code key="so-claimat" className="text-xs">claimed_at</code>, "Date", "When the worker claimed it"],
                    ]}
                />

                <h3 className="text-lg font-semibold mb-3 mt-6">Alerts Collection</h3>
                <p className="text-muted-foreground mb-4">
                    Stores alerts for notifications requiring manual inspection. Created by the Recovery Service
                    when it detects stuck or orphaned notifications that cannot be automatically resolved.
                </p>
                <DocsTable
                    headers={["Field", "Type", "Description"]}
                    rows={[
                        [<code key="al-nid" className="text-xs">notification_id</code>, "ObjectId (ref)", "Reference to the notification document"],
                        [<code key="al-type" className="text-xs">alert_type</code>, "Enum", "ghost_delivery, stuck_processing, or orphaned_pending"],
                        [<code key="al-reason" className="text-xs">reason</code>, "String", "Human-readable explanation of the alert"],
                        [<code key="al-redis" className="text-xs">redis_status</code>, "String", "Status from Redis at detection time (if available)"],
                        [<code key="al-db" className="text-xs">db_status</code>, "Enum", "Status from MongoDB at detection time"],
                        [<code key="al-retry" className="text-xs">retry_count</code>, "Number", "Notification retry count at detection time"],
                        [<code key="al-resolved" className="text-xs">resolved</code>, "Boolean", "Whether the alert has been resolved"],
                        [<code key="al-resolvedat" className="text-xs">resolved_at</code>, "Date", "When the alert was resolved (if applicable)"],
                    ]}
                />

                <h3 className="text-lg font-semibold mb-3 mt-6">Key Indexes</h3>
                <DocsTable
                    headers={["Collection", "Index", "Purpose"]}
                    rows={[
                        [
                            "notifications",
                            <code key="idx1" className="text-xs">{"{ request_id: 1, channel: 1 }"}</code>,
                            <span key="desc1">Unique partial index for idempotency (only non-failed statuses)</span>
                        ],
                        [
                            "notifications",
                            <code key="idx2" className="text-xs">{"{ client_id: 1 }"}</code>,
                            "Fast lookup by client"
                        ],
                        [
                            "notifications",
                            <code key="idx3" className="text-xs">{"{ status: 1 }"}</code>,
                            "Query by delivery status (dashboard filtering)"
                        ],
                        [
                            "outbox",
                            <code key="idx4" className="text-xs">{"{ status: 1, created_at: 1 }"}</code>,
                            "Efficient FIFO polling for pending entries"
                        ],
                        [
                            "outbox",
                            <code key="idx5" className="text-xs">{"{ status: 1, claimed_at: 1 }"}</code>,
                            "Find stale entries for crash recovery"
                        ],
                        [
                            "status_outbox",
                            <code key="idx6" className="text-xs">{"{ processed: 1, created_at: 1 }"}</code>,
                            "Efficient polling for unprocessed status entries"
                        ],
                        [
                            "alerts",
                            <code key="idx7" className="text-xs">{"{ notification_id: 1, alert_type: 1 }"}</code>,
                            "Unique constraint: one alert per notification per type"
                        ],
                        [
                            "alerts",
                            <code key="idx8" className="text-xs">{"{ resolved: 1, created_at: -1 }"}</code>,
                            "Query unresolved alerts for dashboard"
                        ],
                    ]}
                />

                <DocsCallout type="important" title="Partial Index for Idempotency">
                    The unique index on (request_id, channel) uses a partial filter that only indexes
                    entries where status is pending, processing, or delivered. This allows clients to
                    retry with the same request_id after a failure.
                </DocsCallout>
            </section>

            {/* Transactional Outbox Pattern */}
            <section id="transactional-outbox">
                <h2 className="text-2xl font-bold mb-4">Transactional Outbox Pattern</h2>
                <p className="text-muted-foreground mb-4">
                    <strong className="text-foreground">Problem:</strong> How to ensure notifications are never lost,
                    even if the system crashes between database write and Kafka publish?
                </p>
                <p className="text-muted-foreground mb-6">
                    <strong className="text-foreground">Solution:</strong> Use a MongoDB transaction to atomically
                    write both the notification AND an outbox entry in a single operation.
                </p>

                <div className="p-4 rounded-lg border bg-muted/30 mb-6">
                    <h4 className="font-semibold mb-3">Workflow</h4>
                    <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                        <li>API receives notification request</li>
                        <li>Start MongoDB transaction session</li>
                        <li>Insert notification document(s) into notifications collection</li>
                        <li>Insert corresponding outbox entry/entries into outbox collection</li>
                        <li>Commit transaction — both succeed or both fail</li>
                        <li>Return 202 Accepted to client</li>
                        <li>If transaction fails, return 500 Internal Server Error to client</li>
                    </ol>
                </div>

                <DocsCallout type="tip" title="Maximum Delivery Guarantee">
                    If the transaction succeeds, both records exist. If anything fails, both rollback.
                    There is never a state where a notification exists without its outbox entry.
                </DocsCallout>

                <h3 className="text-lg font-semibold mb-3 mt-6">Outbox Entry Lifecycle</h3>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 text-sm font-medium">pending</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 text-sm font-medium">processing</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-600 dark:text-green-400 text-sm font-medium">published</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="px-3 py-1 rounded-full bg-zinc-500/20 text-zinc-600 dark:text-zinc-400 text-sm font-medium">deleted (cleanup)</span>
                </div>
                <p className="text-sm text-muted-foreground">
                    Published entries older than <code className="px-1.5 py-0.5 bg-muted rounded">OUTBOX_RETENTION_MS</code> are
                    automatically deleted by the cleanup cron job.
                </p>
            </section>

            {/* Handling Race Conditions */}
            <section id="race-conditions">
                <h2 className="text-2xl font-bold mb-4">Handling Race Conditions</h2>
                <p className="text-muted-foreground mb-4">
                    <strong className="text-foreground">Problem:</strong> When multiple Background Workers run in
                    parallel for horizontal scaling, how do we prevent two workers from claiming the same outbox entry?
                </p>
                <p className="text-muted-foreground mb-6">
                    <strong className="text-foreground">Solution:</strong> Atomic claim using MongoDB&apos;s
                    <code className="mx-1 px-1.5 py-0.5 bg-muted rounded">findOneAndUpdate</code> with worker identification.
                </p>

                <h3 className="text-lg font-semibold mb-3">Claim Mechanism</h3>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground mb-6">
                    <li>Each worker has a unique <code className="px-1.5 py-0.5 bg-muted rounded">WORKER_ID</code> (configured via environment variable)</li>
                    <li>When polling, worker executes an atomic find-and-update operation</li>
                    <li>Query finds ONE entry where status is <code className="px-1.5 py-0.5 bg-muted rounded">pending</code> OR (status is <code className="px-1.5 py-0.5 bg-muted rounded">processing</code> AND <code className="px-1.5 py-0.5 bg-muted rounded">claimed_at</code> is older than stale threshold)</li>
                    <li>Atomically updates: status → processing, claimed_by → WORKER_ID, claimed_at → now</li>
                    <li>Only one worker can successfully claim each entry due to atomicity</li>
                    <li>Sort by <code className="px-1.5 py-0.5 bg-muted rounded">created_at</code> ensures FIFO (first-in-first-out) processing</li>
                </ol>

                <DocsCallout type="important" title="Crashed Worker Recovery">
                    If a worker crashes while processing an entry, that entry remains in &quot;processing&quot; status.
                    After <code>OUTBOX_CLAIM_TIMEOUT_MS</code> (default: 30 seconds), another worker can reclaim
                    the stale entry, ensuring no notifications are permanently stuck.
                </DocsCallout>

                <h3 className="text-lg font-semibold mb-3 mt-6">Configuration</h3>
                <DocsTable
                    headers={["Variable", "Default", "Description"]}
                    rows={[
                        [<code key="poll" className="text-xs">OUTBOX_POLL_INTERVAL_MS</code>, "2000", "How often workers poll for new entries"],
                        [<code key="batch" className="text-xs">OUTBOX_BATCH_SIZE</code>, "50", "Maximum entries claimed per poll"],
                        [<code key="timeout" className="text-xs">OUTBOX_CLAIM_TIMEOUT_MS</code>, "30000", "When an entry is considered stale"],
                    ]}
                />
            </section>

            {/* Idempotency */}
            <section id="idempotency">
                <h2 className="text-2xl font-bold mb-4">Idempotency</h2>
                <p className="text-muted-foreground mb-6">
                    <strong className="text-foreground">Problem:</strong> How to prevent sending the same notification
                    twice if a request is retried or a Kafka message is redelivered?
                </p>

                <h3 className="text-lg font-semibold mb-3">API Level Idempotency</h3>
                <p className="text-muted-foreground mb-4">
                    Uses a unique partial index on <code className="px-1.5 py-0.5 bg-muted rounded">(request_id, channel)</code>.
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-6">
                    <li>If a request with the same request_id + channel already exists with status pending, processing, or delivered → <strong className="text-foreground">Reject with 409 Conflict</strong></li>
                    <li>If existing notification has status failed → <strong className="text-foreground">Allow</strong> (enables retry with same request_id)</li>
                </ul>

                <h3 className="text-lg font-semibold mb-3">Processor Level Idempotency (Redis)</h3>
                <p className="text-muted-foreground mb-4">
                    Even with API-level protection, Kafka may redeliver messages (e.g., consumer crash before offset commit).
                    The <code className="px-1.5 py-0.5 bg-muted rounded">tryAcquireProcessingLock</code> function uses an atomic Redis Lua script to prevent re-processing.
                </p>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 text-sm font-medium">processing</span>
                    <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-600 dark:text-green-400 text-sm font-medium">delivered</span>
                    <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-600 dark:text-red-400 text-sm font-medium">failed</span>
                </div>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-4">
                    <li>If key doesn&apos;t exist → Atomically acquire lock with TTL, proceed with processing</li>
                    <li>If status is <code className="px-1.5 py-0.5 bg-muted rounded">delivered</code> → Skip (already completed)</li>
                    <li>If status is <code className="px-1.5 py-0.5 bg-muted rounded">processing</code> → Skip (another worker handling)</li>
                    <li>If status is <code className="px-1.5 py-0.5 bg-muted rounded">failed</code> → Acquire lock, proceed (retry allowed)</li>
                </ul>

                <DocsCallout type="important" title="Atomic Lua Script">
                    All check-and-set operations use atomic Redis Lua scripts. This prevents race conditions
                    where two processors might simultaneously check and both find the key missing. The script
                    returns the current status so consumers know whether to skip or proceed.
                </DocsCallout>

                <h3 className="text-lg font-semibold mb-3 mt-4">Manual Kafka Offset Commits</h3>
                <p className="text-muted-foreground mb-4">
                    Consumers use <code className="px-1.5 py-0.5 bg-muted rounded">autoCommit: false</code> and manually commit offsets
                    only after successful processing. This ensures messages are redelivered if a consumer crashes mid-processing.
                </p>

                <h3 className="text-lg font-semibold mb-3 mt-4">Configuration</h3>
                <DocsTable
                    headers={["Variable", "Default", "Description"]}
                    rows={[
                        [<code key="pttl" className="text-xs">PROCESSING_TTL_SECONDS</code>, "300", "How long a processing lock is held"],
                        [<code key="ittl" className="text-xs">IDEMPOTENCY_TTL_SECONDS</code>, "86400", "How long delivered/failed status is remembered"],
                    ]}
                />
            </section>

            {/* Rate Limiting */}
            <section id="rate-limiting">
                <h2 className="text-2xl font-bold mb-4">Rate Limiting</h2>
                <p className="text-muted-foreground mb-4">
                    <strong className="text-foreground">Problem:</strong> External services (SMTP, WhatsApp API)
                    have rate limits. How to control sending rate across distributed processors?
                </p>
                <p className="text-muted-foreground mb-6">
                    <strong className="text-foreground">Solution:</strong> Distributed token bucket algorithm using Redis.
                </p>

                <h3 className="text-lg font-semibold mb-3">How Token Bucket Works</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-6">
                    <li>Each channel (email, WhatsApp) has a bucket of tokens stored in Redis</li>
                    <li>Sending a notification consumes 1 token</li>
                    <li>Tokens refill at a configurable rate per second</li>
                    <li>If bucket is empty, the request is rate-limited</li>
                    <li>The check-and-consume operation is atomic (Lua script) to prevent race conditions</li>
                </ul>

                <h3 className="text-lg font-semibold mb-3">When Rate Limited</h3>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground mb-6">
                    <li>The processor does NOT send the notification</li>
                    <li><code className="px-1.5 py-0.5 bg-muted rounded">retry_count</code> is incremented</li>
                    <li>If <code className="px-1.5 py-0.5 bg-muted rounded">retry_count &gt; MAX_RETRY_COUNT</code> → Mark as permanently failed</li>
                    <li>Otherwise → Push to <code className="px-1.5 py-0.5 bg-muted rounded">delayed_notification</code> topic with backoff delay</li>
                </ol>

                <h3 className="text-lg font-semibold mb-3">Configuration (Per Channel)</h3>
                <DocsTable
                    headers={["Variable", "Default", "Description"]}
                    rows={[
                        [<code key="et" className="text-xs">EMAIL_RATE_LIMIT_TOKENS</code>, "100", "Maximum email tokens (burst capacity)"],
                        [<code key="er" className="text-xs">EMAIL_RATE_LIMIT_REFILL_RATE</code>, "10", "Email tokens added per second"],
                        [<code key="wt" className="text-xs">WHATSAPP_RATE_LIMIT_TOKENS</code>, "50", "Maximum WhatsApp tokens"],
                        [<code key="wr" className="text-xs">WHATSAPP_RATE_LIMIT_REFILL_RATE</code>, "5", "WhatsApp tokens per second"],
                    ]}
                />
            </section>

            {/* Retry Logic */}
            <section id="retry-logic">
                <h2 className="text-2xl font-bold mb-4">Retry Logic with Exponential Backoff</h2>
                <p className="text-muted-foreground mb-6">
                    When a delivery fails (SMTP error, API error, or rate limited), the system automatically
                    retries with increasing delays.
                </p>

                <h3 className="text-lg font-semibold mb-3">Retry Flow</h3>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground mb-6">
                    <li>Set idempotency status to <code className="px-1.5 py-0.5 bg-muted rounded">failed</code> in Redis (allows future retry)</li>
                    <li>Increment <code className="px-1.5 py-0.5 bg-muted rounded">retry_count</code></li>
                    <li>Check against <code className="px-1.5 py-0.5 bg-muted rounded">MAX_RETRY_COUNT</code>:
                        <ul className="list-disc list-inside ml-6 mt-2 space-y-1">
                            <li>If exceeded → Mark as permanently failed, publish failure status</li>
                            <li>Otherwise → Push to delayed queue for retry</li>
                        </ul>
                    </li>
                </ol>

                <h3 className="text-lg font-semibold mb-3">Backoff Calculation</h3>
                <div className="p-4 rounded-lg border bg-muted/30 mb-6">
                    <p className="font-mono text-sm mb-2">delay = min(5000 × 2^retryCount, 60000) milliseconds</p>
                    <p className="text-sm text-muted-foreground">
                        Sequence: <strong>5s → 10s → 20s → 40s → 60s</strong> (capped at 60 seconds)
                    </p>
                </div>

                <h3 className="text-lg font-semibold mb-3">Example</h3>
                <DocsTable
                    headers={["Attempt", "retry_count", "Backoff Delay"]}
                    rows={[
                        ["First failure", "1", "5 seconds"],
                        ["Second failure", "2", "10 seconds"],
                        ["Third failure", "3", "20 seconds"],
                        ["Fourth failure", "4", "40 seconds"],
                        ["Fifth failure", "5", "60 seconds"],
                        [<span key="max" className="text-red-500 dark:text-red-400">MAX_RETRY_COUNT exceeded</span>, "6", "Permanently failed"],
                    ]}
                />
            </section>

            {/* Delayed/Scheduled Notifications */}
            <section id="delayed-notifications">
                <h2 className="text-2xl font-bold mb-4">Delayed/Scheduled Notifications</h2>
                <p className="text-muted-foreground mb-4">
                    <strong className="text-foreground">Use Cases:</strong>
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-6">
                    <li><strong>Scheduled delivery:</strong> Client specifies <code className="px-1.5 py-0.5 bg-muted rounded">scheduled_at</code> in the future</li>
                    <li><strong>Retry handling:</strong> Failed notifications are rescheduled with backoff delay</li>
                </ul>

                <h3 className="text-lg font-semibold mb-3">Two-Phase Claim/Confirm Architecture</h3>
                <p className="text-muted-foreground mb-4">
                    The delayed queue uses a two-phase processing pattern to prevent message loss:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="p-4 rounded-lg border bg-card">
                        <h4 className="font-semibold mb-2">1. Consumer</h4>
                        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                            <li>Consumes from <code className="px-1 py-0.5 bg-muted rounded text-xs">delayed_notification</code> topic</li>
                            <li>Stores event in Redis ZSET</li>
                            <li>Uses <code className="px-1 py-0.5 bg-muted rounded text-xs">scheduled_at</code> as score</li>
                        </ul>
                    </div>
                    <div className="p-4 rounded-lg border bg-card">
                        <h4 className="font-semibold mb-2">2. Claim</h4>
                        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                            <li>Poller calls <code className="px-1 py-0.5 bg-muted rounded text-xs">claimDueEvents</code></li>
                            <li>Atomically sets claim lock with TTL</li>
                            <li>Events remain in ZSET until confirmed</li>
                        </ul>
                    </div>
                    <div className="p-4 rounded-lg border bg-card">
                        <h4 className="font-semibold mb-2">3. Confirm</h4>
                        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                            <li>After Kafka publish succeeds</li>
                            <li>Calls <code className="px-1 py-0.5 bg-muted rounded text-xs">confirmProcessed</code></li>
                            <li>Atomically removes from ZSET</li>
                        </ul>
                    </div>
                </div>

                <DocsCallout type="important" title="Crash Recovery">
                    If a worker crashes after claiming but before confirming, the claim TTL expires and
                    another worker can re-claim the event. Events are only removed after successful Kafka publish.
                </DocsCallout>

                <h3 className="text-lg font-semibold mb-3 mt-4">Poller Failure Handling</h3>
                <p className="text-muted-foreground mb-4">
                    If publishing to the target Kafka topic fails:
                </p>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground mb-4">
                    <li>Call <code className="px-1.5 py-0.5 bg-muted rounded">releaseClaim</code> to allow immediate re-processing</li>
                    <li>Increment <code className="px-1.5 py-0.5 bg-muted rounded">_pollerRetries</code> counter</li>
                    <li>If <code className="px-1.5 py-0.5 bg-muted rounded">_pollerRetries &gt; MAX_POLLER_RETRIES</code> → Send to Dead Letter handling</li>
                </ol>
            </section>

            {/* Dead Letter Handling */}
            <section id="dlq">
                <h2 className="text-2xl font-bold mb-4">Dead Letter Handling</h2>
                <p className="text-muted-foreground mb-6">
                    When an event exceeds <code className="px-1.5 py-0.5 bg-muted rounded">MAX_POLLER_RETRIES</code> in the Delayed
                    Processor, it enters the Dead Letter handling flow.
                </p>

                <h3 className="text-lg font-semibold mb-3">DLQ Flow</h3>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground mb-6">
                    <li>Event exceeds <code className="px-1.5 py-0.5 bg-muted rounded">MAX_POLLER_RETRIES</code></li>
                    <li>Delayed Processor publishes a <strong className="text-foreground">failure status message</strong> to the <code className="px-1.5 py-0.5 bg-muted rounded">notification_status</code> Kafka topic</li>
                    <li>Background Worker&apos;s <strong className="text-foreground">status consumer</strong> receives this message</li>
                    <li>Status consumer updates the notification document in MongoDB:
                        <ul className="list-disc list-inside ml-6 mt-2 space-y-1">
                            <li>Sets <code className="px-1.5 py-0.5 bg-muted rounded">status = failed</code></li>
                            <li>Sets <code className="px-1.5 py-0.5 bg-muted rounded">error_message</code> with DLQ failure reason</li>
                        </ul>
                    </li>
                    <li>Admin Dashboard queries MongoDB for failed notifications</li>
                    <li>Admin can manually trigger a retry via the dashboard</li>
                </ol>

                <DocsCallout type="important" title="Dashboard Direct MongoDB Access">
                    The Admin Dashboard has its own direct MongoDB connection. When retrying failed notifications:
                    <ul className="list-disc list-inside mt-2 space-y-1">
                        <li>Dashboard resets <code>status</code> to <code>pending</code></li>
                        <li>Creates a new outbox entry with the same request_id</li>
                        <li>Background Worker picks up and reprocesses</li>
                    </ul>
                </DocsCallout>
            </section>

            {/* Status Updates & Webhooks */}
            <section id="status-webhooks">
                <h2 className="text-2xl font-bold mb-4">Status Updates & Webhooks</h2>

                <h3 className="text-lg font-semibold mb-3">Status Update Flow</h3>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground mb-6">
                    <li>Processor completes delivery (success or failure after max retries)</li>
                    <li>Publishes status message to <code className="px-1.5 py-0.5 bg-muted rounded">notification_status</code> Kafka topic</li>
                    <li>Background Worker&apos;s status consumer receives message</li>
                    <li>Updates MongoDB notification document with new status</li>
                    <li>Sends HTTP POST to client&apos;s <code className="px-1.5 py-0.5 bg-muted rounded">webhook_url</code></li>
                </ol>

                <h3 className="text-lg font-semibold mb-3">Webhook Payload</h3>
                <DocsTable
                    headers={["Field", "Description"]}
                    rows={[
                        [<code key="wrid" className="text-xs">request_id</code>, "Client's original request identifier"],
                        [<code key="wnid" className="text-xs">notification_id</code>, "System-generated notification ID"],
                        [<code key="wstat" className="text-xs">status</code>, "DELIVERED or FAILED"],
                        [<code key="wchan" className="text-xs">channel</code>, "email or whatsapp"],
                        [<code key="wmsg" className="text-xs">message</code>, "Success message or error details"],
                        [<code key="wocc" className="text-xs">occurred_at</code>, "Timestamp of status change"],
                    ]}
                />

                <DocsCallout type="note" title="Webhook Reliability">
                    Webhook failures are logged but do not block processing. The notification status is
                    already persisted to MongoDB before the webhook is called. Clients can query the API
                    or dashboard for status if their webhook fails.
                </DocsCallout>
            </section>

            {/* Kafka Topics */}
            <section id="kafka-topics">
                <h2 className="text-2xl font-bold mb-4">Kafka Topics & Consumer Groups</h2>

                <h3 className="text-lg font-semibold mb-3">Topics</h3>
                <DocsTable
                    headers={["Topic", "Publisher(s)", "Consumer", "Purpose"]}
                    rows={[
                        [
                            <code key="t1" className="text-xs">email_notification</code>,
                            "Worker, Poller",
                            "Email Processor",
                            "Email delivery requests"
                        ],
                        [
                            <code key="t2" className="text-xs">whatsapp_notification</code>,
                            "Worker, Poller",
                            "WhatsApp Processor",
                            "WhatsApp delivery requests"
                        ],
                        [
                            <code key="t3" className="text-xs">delayed_notification</code>,
                            "Worker, Processors",
                            "Delayed Consumer",
                            "Scheduled notifications & retries"
                        ],
                        [
                            <code key="t4" className="text-xs">notification_status</code>,
                            "All Processors",
                            "Status Consumer",
                            "Delivery status updates"
                        ],
                    ]}
                />

                <h3 className="text-lg font-semibold mb-3 mt-6">Partition Scaling</h3>
                <p className="text-muted-foreground mb-4">
                    Each topic can have multiple partitions for parallel processing. More partitions =
                    more consumers can process in parallel. Each partition is consumed by exactly one
                    consumer in a consumer group.
                </p>
                <DocsTable
                    headers={["Variable", "Description"]}
                    rows={[
                        [<code key="ep" className="text-xs">EMAIL_PARTITION</code>, "Number of partitions for email_notification topic"],
                        [<code key="wp" className="text-xs">WHATSAPP_PARTITION</code>, "Number of partitions for whatsapp_notification topic"],
                        [<code key="dp" className="text-xs">DELAYED_PARTITION</code>, "Number of partitions for delayed_notification topic"],
                        [<code key="sp" className="text-xs">NOTIFICATION_STATUS_PARTITION</code>, "Number of partitions for notification_status topic"],
                    ]}
                />
            </section>

            {/* Recovery Service */}
            <section id="recovery-service">
                <h2 className="text-2xl font-bold mb-4">Recovery Service</h2>
                <p className="text-muted-foreground mb-6">
                    The Recovery Service is a critical component that runs as a separate cron job to detect and recover
                    stuck notifications. It ensures <strong className="text-foreground">maximum delivery guarantees</strong> by
                    cross-referencing MongoDB and Redis states to identify inconsistencies and take corrective action.
                </p>

                {/* Quick Reference */}
                <div className="p-4 rounded-lg border bg-linear-to-r from-blue-500/5 to-purple-500/5 border-blue-500/20 mb-6">
                    <h4 className="font-semibold mb-3 text-blue-600 dark:text-blue-400">Quick Reference</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                            <p className="font-medium">Trigger</p>
                            <p className="text-muted-foreground">Cron job at configurable intervals</p>
                        </div>
                        <div>
                            <p className="font-medium">Data Sources</p>
                            <p className="text-muted-foreground">MongoDB (notification status) + Redis (idempotency)</p>
                        </div>
                        <div>
                            <p className="font-medium">Outcomes</p>
                            <p className="text-muted-foreground">Auto-resolution OR Alert creation</p>
                        </div>
                    </div>
                </div>

                <h3 className="text-lg font-semibold mb-3">Why Recovery is Needed</h3>
                <p className="text-muted-foreground mb-4">
                    In a distributed system, several failure scenarios can leave notifications in an inconsistent state:
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-6">
                    <li><strong>Processor crash after delivery:</strong> Email sent successfully, but processor crashes before updating MongoDB status</li>
                    <li><strong>Network partition:</strong> Kafka message delivered but status update lost</li>
                    <li><strong>Worker crash during outbox processing:</strong> Notification stuck in processing without being published to Kafka</li>
                    <li><strong>Orphaned notifications:</strong> API committed to MongoDB but outbox entry was never picked up</li>
                </ul>

                <h3 className="text-lg font-semibold mb-3">Three Types of Stuck Notifications</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="p-4 rounded-lg border bg-yellow-500/5 border-yellow-500/20">
                        <h4 className="font-semibold mb-2 text-yellow-600 dark:text-yellow-400">Ghost Delivery</h4>
                        <p className="text-sm text-muted-foreground">
                            Redis shows <code className="px-1 py-0.5 bg-muted rounded text-xs">delivered</code> but
                            MongoDB still shows <code className="px-1 py-0.5 bg-muted rounded text-xs">processing</code>.
                            The notification was successfully delivered but the database wasn&apos;t updated.
                        </p>
                    </div>
                    <div className="p-4 rounded-lg border bg-red-500/5 border-red-500/20">
                        <h4 className="font-semibold mb-2 text-red-600 dark:text-red-400">Stuck Processing</h4>
                        <p className="text-sm text-muted-foreground">
                            MongoDB shows <code className="px-1 py-0.5 bg-muted rounded text-xs">processing</code> for
                            longer than the threshold. Redis may show <code className="px-1 py-0.5 bg-muted rounded text-xs">processing</code>,
                            <code className="px-1 py-0.5 bg-muted rounded text-xs">failed</code>, or no record at all.
                        </p>
                    </div>
                    <div className="p-4 rounded-lg border bg-orange-500/5 border-orange-500/20">
                        <h4 className="font-semibold mb-2 text-orange-600 dark:text-orange-400">Orphaned Pending</h4>
                        <p className="text-sm text-muted-foreground">
                            MongoDB shows <code className="px-1 py-0.5 bg-muted rounded text-xs">pending</code> for
                            too long. The notification was never picked up by the outbox processor.
                        </p>
                    </div>
                </div>

                <h3 className="text-lg font-semibold mb-3">Recovery Detection Flow</h3>
                <p className="text-muted-foreground mb-4">
                    The recovery cron runs at configurable intervals and performs these checks:
                </p>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground mb-6">
                    <li><strong>Find stuck processing:</strong> Query MongoDB for notifications with status <code className="px-1.5 py-0.5 bg-muted rounded">processing</code> and <code className="px-1.5 py-0.5 bg-muted rounded">updated_at</code> older than <code className="px-1.5 py-0.5 bg-muted rounded">PROCESSING_STUCK_THRESHOLD_MS</code></li>
                    <li><strong>Cross-reference Redis:</strong> For each stuck notification, check its idempotency status in Redis</li>
                    <li><strong>Determine action:</strong> Based on Redis status, either auto-recover or create an alert</li>
                    <li><strong>Find orphaned pending:</strong> Query for notifications with status <code className="px-1.5 py-0.5 bg-muted rounded">pending</code> older than <code className="px-1.5 py-0.5 bg-muted rounded">PENDING_STUCK_THRESHOLD_MS</code></li>
                    <li><strong>Create alerts:</strong> Create alerts for orphaned pending notifications and stuck processing notifications requiring manual intervention</li>
                </ol>

                <h3 className="text-lg font-semibold mb-3">Auto-Resolution: Ghost Deliveries</h3>
                <DocsCallout type="tip" title="Auto-Resolved Case">
                    Ghost deliveries are <strong>automatically resolved</strong> — they do NOT create alerts.
                    Redis is the source of truth for delivery status.
                </DocsCallout>
                <p className="text-muted-foreground mb-4">
                    When a ghost delivery is detected (Redis says <code className="px-1.5 py-0.5 bg-muted rounded">delivered</code>
                    but MongoDB shows <code className="px-1.5 py-0.5 bg-muted rounded">processing</code>), the Recovery Service
                    uses the <strong className="text-foreground">Status Outbox pattern</strong> to ensure atomic recovery:
                </p>
                <div className="p-4 rounded-lg border bg-muted/30 mb-6">
                    <h4 className="font-semibold mb-3">Transactional Recovery Steps</h4>
                    <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                        <li><strong>Start MongoDB transaction</strong> to ensure atomicity</li>
                        <li><strong>Acquire lock:</strong> Use <code className="px-1.5 py-0.5 bg-muted rounded">findOneAndUpdate</code> to atomically claim the notification and prevent race conditions with other recovery instances</li>
                        <li><strong>Update notification status:</strong> Set status to <code className="px-1.5 py-0.5 bg-muted rounded">delivered</code> in MongoDB</li>
                        <li><strong>Insert status outbox entry:</strong> Create a <code className="px-1.5 py-0.5 bg-muted rounded">status_outbox</code> document with <code className="px-1.5 py-0.5 bg-muted rounded">status: delivered</code></li>
                        <li><strong>Commit transaction:</strong> Both updates succeed or both fail atomically</li>
                    </ol>
                </div>

                <DocsCallout type="important" title="Why Use Status Outbox?">
                    The Status Outbox ensures that status updates are eventually published to the
                    <code className="mx-1">notification_status</code> Kafka topic, even if the recovery service crashes
                    after updating MongoDB. The Background Worker polls the status outbox and publishes status events
                    to Kafka, which then triggers webhook callbacks to clients.
                </DocsCallout>

                <h3 className="text-lg font-semibold mb-3 mt-6">Status Outbox Lifecycle</h3>
                <p className="text-muted-foreground mb-4">
                    The Status Outbox follows the same claim/confirm pattern as the main Outbox:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="p-4 rounded-lg border bg-card">
                        <h4 className="font-semibold mb-2">1. Create</h4>
                        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                            <li>Recovery Service creates entry</li>
                            <li>Inside MongoDB transaction</li>
                            <li><code className="px-1 py-0.5 bg-muted rounded text-xs">processed: false</code></li>
                        </ul>
                    </div>
                    <div className="p-4 rounded-lg border bg-card">
                        <h4 className="font-semibold mb-2">2. Claim</h4>
                        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                            <li>Background Worker polls</li>
                            <li>Atomically claims entry</li>
                            <li>Sets <code className="px-1 py-0.5 bg-muted rounded text-xs">claimed_by</code></li>
                        </ul>
                    </div>
                    <div className="p-4 rounded-lg border bg-card">
                        <h4 className="font-semibold mb-2">3. Publish</h4>
                        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                            <li>Publish to <code className="px-1 py-0.5 bg-muted rounded text-xs">notification_status</code></li>
                            <li>Contains notification ID + status</li>
                            <li>Triggers webhook flow</li>
                        </ul>
                    </div>
                    <div className="p-4 rounded-lg border bg-card">
                        <h4 className="font-semibold mb-2">4. Confirm</h4>
                        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                            <li>Mark <code className="px-1 py-0.5 bg-muted rounded text-xs">processed: true</code></li>
                            <li>Cleanup after retention</li>
                        </ul>
                    </div>
                </div>

                <h3 className="text-lg font-semibold mb-3">Recovery Decision Summary</h3>
                <p className="text-muted-foreground mb-4">
                    The Recovery Service takes different actions based on the Redis idempotency status:
                </p>

                {/* Auto-Resolved vs Alert distinction */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="p-4 rounded-lg border bg-green-500/5 border-green-500/20">
                        <h4 className="font-semibold mb-2 text-green-600 dark:text-green-400">✓ Auto-Resolved (via Status Outbox)</h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                            <li>• <strong>Ghost Delivery:</strong> Redis = <code className="px-1 py-0.5 bg-muted rounded text-xs">delivered</code></li>
                            <li>• <strong>Failed, max retries exceeded:</strong> Redis = <code className="px-1 py-0.5 bg-muted rounded text-xs">failed</code> + retry_count ≥ MAX</li>
                        </ul>
                    </div>
                    <div className="p-4 rounded-lg border bg-red-500/5 border-red-500/20">
                        <h4 className="font-semibold mb-2 text-red-600 dark:text-red-400">✗ Creates Alert (Manual Intervention)</h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                            <li>• <strong>Stuck Processing:</strong> Redis = <code className="px-1 py-0.5 bg-muted rounded text-xs">failed</code>, <code className="px-1 py-0.5 bg-muted rounded text-xs">processing</code>, or null</li>
                            <li>• <strong>Orphaned Pending:</strong> Notification stuck in pending state</li>
                        </ul>
                    </div>
                </div>

                <h4 className="font-semibold mb-3">Detailed Recovery Actions</h4>
                <DocsTable
                    headers={["Scenario", "Redis Status", "Resolution", "Action"]}
                    rows={[
                        [
                            <span key="gd-row" className="font-medium text-green-600 dark:text-green-400">Ghost Delivery</span>,
                            <code key="gd-redis" className="text-xs">delivered</code>,
                            <span key="gd-res" className="text-green-600 dark:text-green-400">Auto</span>,
                            "Update MongoDB to delivered, write to status_outbox"
                        ],
                        [
                            <span key="me-row" className="font-medium text-green-600 dark:text-green-400">Failed (max retries)</span>,
                            <code key="me-redis" className="text-xs">failed</code>,
                            <span key="me-res" className="text-green-600 dark:text-green-400">Auto</span>,
                            "Update MongoDB to failed, write to status_outbox"
                        ],
                        [
                            <span key="fr-row" className="font-medium text-red-600 dark:text-red-400">Failed (retries remaining)</span>,
                            <code key="fr-redis" className="text-xs">failed</code>,
                            <span key="fr-res" className="text-red-600 dark:text-red-400">Alert</span>,
                            "Create STUCK_PROCESSING alert for admin retry"
                        ],
                        [
                            <span key="uk-row" className="font-medium text-red-600 dark:text-red-400">Unknown State</span>,
                            <span key="uk-redis" className="text-muted-foreground text-xs">processing / null</span>,
                            <span key="uk-res" className="text-red-600 dark:text-red-400">Alert</span>,
                            "Create STUCK_PROCESSING alert for inspection"
                        ],
                        [
                            <span key="op-row" className="font-medium text-red-600 dark:text-red-400">Orphaned Pending</span>,
                            <span key="op-redis" className="text-muted-foreground text-xs">N/A</span>,
                            <span key="op-res" className="text-red-600 dark:text-red-400">Alert</span>,
                            "Create ORPHANED_PENDING alert for investigation"
                        ],
                    ]}
                />

                <h3 className="text-lg font-semibold mb-3 mt-6">Managing Alerts via Dashboard</h3>
                <p className="text-muted-foreground mb-4">
                    The Admin Dashboard provides an <strong className="text-foreground">Alerts page</strong> for managing
                    notifications that require manual intervention:
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-6">
                    <li><strong>View alerts:</strong> See all unresolved alerts with type, reason, and notification details</li>
                    <li><strong>Filter by type:</strong> Filter by Stuck Processing or Orphaned Pending</li>
                    <li><strong>Retry notification:</strong> Reset notification to pending and create new outbox entry</li>
                    <li><strong>Dismiss alert:</strong> Mark alert as resolved without retrying</li>
                    <li><strong>Bulk operations:</strong> Retry or dismiss multiple alerts at once</li>
                </ul>

                <h3 className="text-lg font-semibold mb-3">Configuration</h3>
                <DocsTable
                    headers={["Variable", "Default", "Description"]}
                    rows={[
                        [<code key="rpi" className="text-xs">RECOVERY_POLL_INTERVAL_MS</code>, "60000", "How often recovery runs (1 minute)"],
                        [<code key="pst" className="text-xs">PROCESSING_STUCK_THRESHOLD_MS</code>, "300000", "Time before processing is stuck (5 min)"],
                        [<code key="pdt" className="text-xs">PENDING_STUCK_THRESHOLD_MS</code>, "300000", "Time before pending is orphaned (5 min)"],
                        [<code key="rbs" className="text-xs">RECOVERY_BATCH_SIZE</code>, "50", "Max notifications per recovery run"],
                        [<code key="crar" className="text-xs">CLEANUP_RESOLVED_ALERTS_RETENTION_MS</code>, "86400000", "Keep resolved alerts for 24 hours"],
                        [<code key="cpso" className="text-xs">CLEANUP_PROCESSED_STATUS_OUTBOX_RETENTION_MS</code>, "86400000", "Keep processed status entries for 24 hours"],
                    ]}
                />

                <DocsCallout type="tip" title="Tuning Recovery Thresholds">
                    Set <code>PROCESSING_STUCK_THRESHOLD_MS</code> higher than your expected maximum processing time.
                    If emails typically take 30 seconds with retries, set threshold to at least 300 seconds (5 min).
                </DocsCallout>
            </section>

            {/* Graceful Shutdown */}
            <section id="graceful-shutdown">
                <h2 className="text-2xl font-bold mb-4">Graceful Shutdown</h2>
                <p className="text-muted-foreground mb-6">
                    All services implement graceful shutdown to prevent data loss when stopping or restarting.
                </p>

                <h3 className="text-lg font-semibold mb-3">Shutdown Order</h3>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground mb-6">
                    <li><strong>Stop accepting new work</strong> — Stop cron jobs, stop polling</li>
                    <li><strong>Finish in-progress work</strong> — Wait for current message processing to complete</li>
                    <li><strong>Stop consumers</strong> — Commit offsets, disconnect from Kafka</li>
                    <li><strong>Flush producers</strong> — Ensure all pending messages are sent</li>
                    <li><strong>Disconnect databases</strong> — Close MongoDB and Redis connections</li>
                </ol>

                <h3 className="text-lg font-semibold mb-3">Signals Handled</h3>
                <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-3 py-1 rounded-full bg-muted text-sm font-medium">SIGTERM</span>
                    <span className="px-3 py-1 rounded-full bg-muted text-sm font-medium">SIGINT (Ctrl+C)</span>
                    <span className="px-3 py-1 rounded-full bg-muted text-sm font-medium">uncaughtException</span>
                    <span className="px-3 py-1 rounded-full bg-muted text-sm font-medium">unhandledRejection</span>
                </div>

                <DocsCallout type="tip" title="Protection Against Duplicate Shutdowns">
                    A shutdown flag prevents duplicate shutdown attempts if multiple signals arrive.
                    Once shutdown begins, subsequent signals are ignored.
                </DocsCallout>
            </section>

            {/* Continue Learning */}
            <DocsNavGrid
                items={[
                    { link: "/docs/api-reference", heading: "API Reference", subtitle: "Complete API documentation with examples" },
                    { link: "/docs/getting-started", heading: "Getting Started", subtitle: "Learn how to get started with SimpleNS" },
                    { link: "/docs/configuration", heading: "Configuration", subtitle: "All environment variables explained" },
                ]}
            />
        </div>
    );
}
