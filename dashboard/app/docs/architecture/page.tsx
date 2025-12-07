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
                    Redis-based processing locks prevent re-processing.
                </p>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 text-sm font-medium">processing</span>
                    <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-600 dark:text-green-400 text-sm font-medium">delivered</span>
                    <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-600 dark:text-red-400 text-sm font-medium">failed</span>
                </div>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-4">
                    <li>If key doesn&apos;t exist → Acquire lock, proceed with processing</li>
                    <li>If status is <code className="px-1.5 py-0.5 bg-muted rounded">delivered</code> → Skip (already completed)</li>
                    <li>If status is <code className="px-1.5 py-0.5 bg-muted rounded">processing</code> → Skip (another worker handling)</li>
                    <li>If status is <code className="px-1.5 py-0.5 bg-muted rounded">failed</code> → Acquire lock, proceed (retry allowed)</li>
                </ul>

                <DocsCallout type="note" title="Atomic Operations">
                    The check-and-set operation uses a Redis Lua script for atomicity. This prevents race
                    conditions where two processors might simultaneously check and both find the key missing.
                </DocsCallout>

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

                <h3 className="text-lg font-semibold mb-3">Two-Phase Architecture</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="p-4 rounded-lg border bg-card">
                        <h4 className="font-semibold mb-2">Phase 1: Consumer</h4>
                        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                            <li>Listens to <code className="px-1 py-0.5 bg-muted rounded text-xs">delayed_notification</code> Kafka topic</li>
                            <li>Stores event in Redis ZSET</li>
                            <li>Uses <code className="px-1 py-0.5 bg-muted rounded text-xs">scheduled_at</code> timestamp as score</li>
                            <li>ZSET automatically orders by time</li>
                        </ul>
                    </div>
                    <div className="p-4 rounded-lg border bg-card">
                        <h4 className="font-semibold mb-2">Phase 2: Poller</h4>
                        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                            <li>Runs every <code className="px-1 py-0.5 bg-muted rounded text-xs">DELAYED_POLL_INTERVAL_MS</code></li>
                            <li>Fetches events where score ≤ current time</li>
                            <li>Atomic fetch-and-remove (prevents duplicates)</li>
                            <li>Publishes to target channel topic</li>
                        </ul>
                    </div>
                </div>

                <DocsCallout type="note" title="Multi-Worker Safe">
                    The fetch-and-remove operation uses a Redis Lua script for atomicity. Multiple Delayed
                    Processors can run in parallel without picking up the same events.
                </DocsCallout>

                <h3 className="text-lg font-semibold mb-3 mt-4">Poller Failure Handling</h3>
                <p className="text-muted-foreground mb-4">
                    If publishing to the target Kafka topic fails:
                </p>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground mb-4">
                    <li>Increment <code className="px-1.5 py-0.5 bg-muted rounded">_pollerRetries</code> counter (separate from processor retry_count)</li>
                    <li>Re-add to queue with exponential backoff</li>
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
