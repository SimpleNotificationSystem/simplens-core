import { CodeBlock } from "@/components/docs/code-block";
import { DocsCallout } from "@/components/docs/docs-callout";
import { DocsTable } from "@/components/docs/docs-table";
import { DocsNavGrid } from "@/components/docs/docs-nav-grid";
import { DocsTableOfContents } from "@/components/docs/docs-toc";

export default function ScalingPage() {
    return (
        <div className="space-y-10">
            <section>
                <h1 className="text-4xl font-bold tracking-tight mb-4">Scaling</h1>
                <p className="text-xl text-muted-foreground">
                    Learn how to scale SimpleNS for high throughput and reliability.
                </p>
            </section>

            <DocsTableOfContents
                items={[
                    { id: "horizontal-scaling", label: "Horizontal Scaling" },
                    { id: "docker-scaling", label: "Scaling Processors with Docker" },
                    { id: "kafka-partitions", label: "Kafka Partition Configuration" },
                    { id: "rate-limiting", label: "Distributed Rate Limiting" },
                    { id: "api-scaling", label: "Scaling the API Server" },
                    { id: "mongodb-scaling", label: "Scaling MongoDB" },
                    { id: "redis-scaling", label: "Scaling Redis" },
                    { id: "best-practices", label: "Scaling Best Practices" },
                    { id: "production-config", label: "Example Production Configuration" },
                ]}
            />
            {/* Overview */}
            <section id="horizontal-scaling">
                <h2 className="text-2xl font-bold mb-4">Horizontal Scaling</h2>
                <p className="text-muted-foreground mb-4">
                    SimpleNS is designed for horizontal scaling. Each processor can be scaled independently
                    to handle increased load. Kafka&apos;s consumer groups ensure that messages are distributed
                    across processor instances.
                </p>
                <DocsCallout type="note" title="Kafka Consumer Groups">
                    Each processor type belongs to its own consumer group. Multiple instances of the
                    same processor share the workload automatically.
                </DocsCallout>
            </section>

            {/* Scaling Processors */}
            <section id="docker-scaling">
                <h2 className="text-2xl font-bold mb-4">Scaling Processors with Docker</h2>
                <p className="text-muted-foreground mb-4">
                    Use Docker Compose to scale processor instances:
                </p>
                <CodeBlock language="bash">
                    {`# Scale email processor to 3 instances
docker-compose up -d --scale email-processor=3

# Scale WhatsApp processor to 2 instances
docker-compose up -d --scale whatsapp-processor=2

# Scale multiple services at once
docker-compose up -d --scale email-processor=3 --scale whatsapp-processor=2`}
                </CodeBlock>

                <h3 className="text-lg font-semibold mb-3 mt-6">Verify Scaling</h3>
                <CodeBlock language="bash">
                    {`# Check running containers
docker-compose ps

# View logs from all email processors
docker-compose logs -f email-processor`}
                </CodeBlock>
            </section>

            {/* Kafka Partitions */}
            <section id="kafka-partitions">
                <h2 className="text-2xl font-bold mb-4">Kafka Partition Configuration</h2>
                <p className="text-muted-foreground mb-4">
                    The number of Kafka partitions determines the maximum parallelism for message consumption.
                    Each partition can only be consumed by one consumer at a time within a consumer group.
                </p>

                <DocsCallout type="important" title="Partition Rule">
                    The number of partitions should be greater than or equal to the number of consumers.
                    Extra partitions are fine, but fewer partitions than consumers means some consumers
                    will be idle.
                </DocsCallout>

                <h3 className="text-lg font-semibold mb-3 mt-6">Configure Partitions</h3>
                <p className="text-muted-foreground mb-4">
                    Set partition counts via environment variables before starting the API server:
                </p>
                <CodeBlock language="bash" filename=".env">
                    {`# Partition configuration
EMAIL_PARTITION=4
WHATSAPP_PARTITION=2
DELAYED_PARTITION=2
NOTIFICATION_STATUS_PARTITION=2`}
                </CodeBlock>

                <DocsCallout type="warning" title="Partitions Cannot Be Reduced">
                    Kafka partitions can only be increased, never decreased. Plan your partition
                    count based on expected peak load.
                </DocsCallout>

                <h3 className="text-lg font-semibold mb-3 mt-6">Partition Guidelines</h3>
                <DocsTable
                    headers={["Throughput", "Recommended Partitions", "Processor Instances"]}
                    rows={[
                        ["Low (< 100/min)", "1-2", "1"],
                        ["Medium (100-1000/min)", "4-8", "2-4"],
                        ["High (1000-10000/min)", "8-16", "4-8"],
                        ["Very High (> 10000/min)", "16-32", "8-16"],
                    ]}
                />
            </section>

            {/* Rate Limiting */}
            <section id="rate-limiting">
                <h2 className="text-2xl font-bold mb-4">Distributed Rate Limiting</h2>
                <p className="text-muted-foreground mb-4">
                    SimpleNS uses Redis for distributed rate limiting. The token bucket state is stored
                    in Redis, ensuring consistent rate limiting across all processor instances.
                </p>

                <h3 className="text-lg font-semibold mb-3">How It Works</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-4">
                    <li>Each channel (email, WhatsApp) has its own token bucket</li>
                    <li>Tokens are stored in Redis with atomic operations</li>
                    <li>All processor instances share the same token pool</li>
                    <li>Tokens refill at a configurable rate</li>
                </ul>

                <h3 className="text-lg font-semibold mb-3 mt-6">Configure Rate Limits</h3>
                <CodeBlock language="bash" filename=".env">
                    {`# Email rate limiting
EMAIL_RATE_LIMIT_TOKENS=100    # Max tokens
EMAIL_RATE_LIMIT_REFILL_RATE=10 # Tokens per second

# WhatsApp rate limiting  
WHATSAPP_RATE_LIMIT_TOKENS=50
WHATSAPP_RATE_LIMIT_REFILL_RATE=5`}
                </CodeBlock>

                <DocsCallout type="tip" title="Burst Handling">
                    The token bucket algorithm allows bursting up to the max tokens, then smoothly
                    throttles to the refill rate. This is ideal for handling traffic spikes.
                </DocsCallout>
            </section>

            {/* Scaling the API */}
            <section id="api-scaling">
                <h2 className="text-2xl font-bold mb-4">Scaling the API Server</h2>
                <p className="text-muted-foreground mb-4">
                    The API server is stateless and can be scaled horizontally behind a load balancer.
                </p>

                <h3 className="text-lg font-semibold mb-3">Docker Compose Scaling</h3>
                <p className="text-muted-foreground mb-4">
                    Scale API instances using Docker Compose:
                </p>
                <CodeBlock language="bash">
                    {`# Scale API server to 3 instances
docker-compose up -d --scale api=3`}
                </CodeBlock>

                <DocsCallout type="warning" title="Port Mapping Conflict">
                    If your <code>docker-compose.yml</code> maps the API to a fixed host port
                    (e.g., <code>ports: &quot;3000:3000&quot;</code>), scaling will fail due to port conflicts.
                    <br /><br />
                    <strong>Solutions:</strong>
                    <ul className="list-disc list-inside mt-2">
                        <li>Use port ranges: <code>ports: &quot;3000-3010:3000&quot;</code></li>
                        <li>Remove host port binding and use a load balancer</li>
                        <li>Use <code>expose: - &quot;3000&quot;</code> for internal-only access</li>
                    </ul>
                </DocsCallout>

                <h3 className="text-lg font-semibold mb-3 mt-6">Production Load Balancer (Optional)</h3>
                <p className="text-muted-foreground mb-4">
                    For production deployments, place multiple API instances behind a load balancer
                    (nginx, HAProxy, or cloud LB). Here&apos;s an example nginx configuration:
                </p>
                <CodeBlock language="nginx" filename="nginx.conf (external setup)">
                    {`upstream simplens_api {
    least_conn;
    server api-1:3000;
    server api-2:3000;
    server api-3:3000;
}

server {
    listen 80;
    
    location / {
        proxy_pass http://simplens_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location /health {
        proxy_pass http://simplens_api;
    }
}`}
                </CodeBlock>

                <DocsCallout type="note" title="Not Included in Docker Compose">
                    The nginx configuration above is an example for external production setups.
                    SimpleNS does not include nginx in the default docker-compose.yml.
                    Configure your load balancer to use the <code>/health</code> endpoint for health checks.
                </DocsCallout>
            </section>

            {/* Scaling MongoDB */}
            <section id="mongodb-scaling">
                <h2 className="text-2xl font-bold mb-4">Scaling MongoDB</h2>
                <p className="text-muted-foreground mb-4">
                    For high-volume deployments, consider these MongoDB scaling strategies:
                </p>

                <h3 className="text-lg font-semibold mb-3">Replica Set (High Availability)</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-4">
                    <li>Deploy a 3-node replica set for fault tolerance</li>
                    <li>Configure read preference for read scaling</li>
                    <li>Use majority write concern for durability</li>
                </ul>

                <h3 className="text-lg font-semibold mb-3 mt-4">Sharding (Horizontal Scaling)</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-4">
                    <li>Shard the notifications collection by <code className="px-1.5 py-0.5 bg-muted rounded">client_id</code></li>
                    <li>Distributes data across multiple shards</li>
                    <li>Recommended for 100M+ notifications</li>
                </ul>

                <DocsCallout type="warning" title="Replica Set Required">
                    SimpleNS requires MongoDB replica set mode for using database transactions.
                    Even for development, start MongoDB with <code>--replSet rs0</code>.
                    You can use MongoDB Atlas for replica set mode for simple setup.
                </DocsCallout>
            </section>

            {/* Scaling Redis */}
            <section id="redis-scaling">
                <h2 className="text-2xl font-bold mb-4">Scaling Redis</h2>
                <p className="text-muted-foreground mb-4">
                    Redis is used for rate limiting, idempotency checks, and the delayed queue.
                </p>

                <h3 className="text-lg font-semibold mb-3">Redis Cluster</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-4">
                    <li>Deploy Redis Cluster for horizontal scaling</li>
                    <li>Data is automatically sharded across nodes</li>
                    <li>Provides high availability with automatic failover</li>
                </ul>

                <h3 className="text-lg font-semibold mb-3 mt-4">Redis Sentinel</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-4">
                    <li>Provides high availability without sharding</li>
                    <li>Automatic primary election on failure</li>
                    <li>Suitable for most deployments</li>
                </ul>
            </section>

            {/* Best Practices */}
            <section id="best-practices">
                <h2 className="text-2xl font-bold mb-4">Scaling Best Practices</h2>

                <h3 className="text-lg font-semibold mb-3">1. Start Small, Scale Gradually</h3>
                <p className="text-muted-foreground mb-4">
                    Begin with minimal configuration and scale based on actual metrics:
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-6">
                    <li>Monitor queue lag in Kafka UI</li>
                    <li>Check processor throughput in Grafana</li>
                    <li>Scale when queue lag consistently grows</li>
                </ul>

                <h3 className="text-lg font-semibold mb-3">2. Match Partitions to Processors</h3>
                <p className="text-muted-foreground mb-4">
                    Ensure you have enough partitions for your processor count:
                </p>
                <CodeBlock language="bash">
                    {`# 4 email processors need at least 4 partitions
EMAIL_PARTITION=4
docker-compose up -d --scale email-processor=4`}
                </CodeBlock>

                <h3 className="text-lg font-semibold mb-3 mt-6">3. Configure Appropriate Rate Limits</h3>
                <p className="text-muted-foreground mb-4">
                    Set rate limits based on Gmail&apos;s sending limits:
                </p>
                <DocsTable
                    headers={["Gmail Account Type", "Daily Limit", "Recommended Tokens", "Refill Rate"]}
                    rows={[
                        ["Personal Gmail", "500/day", "50", "1/sec"],
                        ["Google Workspace", "2000/day", "200", "3/sec"],
                    ]}
                />
                <DocsCallout type="tip" title="High Volume Sending">
                    For higher throughput, consider upgrading to Google Workspace or
                    configuring a dedicated SMTP relay service.
                </DocsCallout>

                <h3 className="text-lg font-semibold mb-3 mt-6">4. Monitor and Alert</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-4">
                    <li>Set up alerts for high queue lag</li>
                    <li>Monitor error rates in processors</li>
                    <li>Track rate limit exhaustion</li>
                    <li>Monitor MongoDB and Redis latency</li>
                </ul>
            </section>

            {/* Example Production Config */}
            <section id="production-config">
                <h2 className="text-2xl font-bold mb-4">Example Production Configuration</h2>
                <p className="text-muted-foreground mb-4">
                    Here&apos;s a sample configuration for a medium-scale deployment handling
                    ~5000 notifications per minute:
                </p>
                <CodeBlock language="yaml" filename="docker-compose.prod.yml">
                    {`# API Server: 2 instances behind load balancer
# Background Worker: 2 instances
# Email Processor: 4 instances
# WhatsApp Processor: 2 instances
# Delayed Processor: 2 instances

# Kafka Partitions:
# - email_notification: 4
# - whatsapp_notification: 2
# - delayed_notification: 2
# - notification_status: 2

# Rate Limits:
# - Email: 500 tokens, 10/sec refill
# - WhatsApp: 100 tokens, 5/sec refill`}
                </CodeBlock>
                <div className="mt-4"></div>
                <CodeBlock language="bash">
                    {`# Scale command
docker-compose -f docker-compose.prod.yml up -d \\
  --scale api=2 \\
  --scale worker=2 \\
  --scale email-processor=4 \\
  --scale whatsapp-processor=2 \\
  --scale delayed-processor=2`}
                </CodeBlock>
            </section>
            <DocsNavGrid
                items={[
                    { link: "/docs/monitoring", heading: "Monitoring", subtitle: "Set up logging and observability" },
                    { link: "/docs/admin-dashboard", heading: "Admin Dashboard", subtitle: "Admin dashboard configuration" },
                    { link: "/docs", heading: "Overview", subtitle: "Learn what is SimpleNS" },
                ]}
            />
        </div>
    );
}
