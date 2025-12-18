import { CodeBlock } from "@/components/docs/code-block";
import { DocsCallout } from "@/components/docs/docs-callout";
import { DocsTable } from "@/components/docs/docs-table";
import { DocsNavGrid } from "@/components/docs/docs-nav-grid";
import { DocsTableOfContents } from "@/components/docs/docs-toc";

export default function MonitoringPage() {
    return (
        <div className="space-y-10">
            <section>
                <h1 className="text-4xl font-bold tracking-tight mb-4">Monitoring</h1>
                <p className="text-xl text-muted-foreground">
                    Monitor SimpleNS with Grafana, Loki, and Kafka UI for complete observability.
                </p>
            </section>

            <DocsTableOfContents
                items={[
                    { id: "observability-stack", label: "Observability Stack" },
                    { id: "grafana", label: "Grafana Dashboard" },
                    { id: "logql", label: "LogQL Queries" },
                    { id: "log-labels", label: "Log Labels" },
                    { id: "kafka-ui", label: "Kafka UI" },
                    { id: "admin-dashboard", label: "Admin Dashboard" },
                    { id: "log-config", label: "Log Configuration" },
                    { id: "alerting", label: "Setting Up Alerts" },
                    { id: "health-checks", label: "Health Checks" },
                    { id: "troubleshooting", label: "Troubleshooting" },
                ]}
            />
            {/* Observability Stack */}
            <section id="observability-stack">
                <h2 className="text-2xl font-bold mb-4">Observability Stack</h2>
                <p className="text-muted-foreground mb-4">
                    SimpleNS includes a complete observability stack out of the box:
                </p>
                <DocsTable
                    headers={["Service", "URL", "Purpose"]}
                    rows={[
                        [
                            "Grafana",
                            <a key="grafana" href="http://localhost:3001" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                                http://localhost:3001
                            </a>,
                            "Log visualization and dashboards"
                        ],
                        [
                            "Loki",
                            <code key="loki" className="text-xs">http://localhost:3100</code>,
                            "Log aggregation (internal)"
                        ],
                        [
                            "Kafka UI",
                            <a key="kafka" href="http://localhost:8080" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                                http://localhost:8080
                            </a>,
                            "Kafka monitoring and inspection"
                        ],
                    ]}
                />
            </section>

            {/* Grafana */}
            <section id="grafana">
                <h2 className="text-2xl font-bold mb-4">Grafana Dashboard</h2>
                <p className="text-muted-foreground mb-4">
                    Grafana is pre-configured with Loki as a data source for log visualization.
                </p>

                <h3 className="text-lg font-semibold mb-3">Access Grafana</h3>
                <DocsTable
                    headers={["Setting", "Value"]}
                    rows={[
                        ["URL", <a key="url" href="http://localhost:3001" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">http://localhost:3001</a>],
                        ["Username", <code key="user" className="text-xs">admin</code>],
                        ["Password", <code key="pass" className="text-xs">admin</code>],
                    ]}
                />

                <h3 className="text-lg font-semibold mb-3 mt-6">Viewing Logs</h3>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground mb-4">
                    <li>Open Grafana at <code className="px-1.5 py-0.5 bg-muted rounded">http://localhost:3001</code></li>
                    <li>Click the <strong>Explore</strong> icon (compass) in the sidebar</li>
                    <li>Select <strong>Loki</strong> as the data source</li>
                    <li>Enter a LogQL query and click <strong>Run query</strong></li>
                </ol>

                <DocsCallout type="tip" title="Anonymous Access">
                    Grafana is configured for anonymous access in development. No login is required
                    to view dashboards.
                </DocsCallout>
            </section>

            {/* LogQL Queries */}
            <section id="logql">
                <h2 className="text-2xl font-bold mb-4">LogQL Queries</h2>
                <p className="text-muted-foreground mb-4">
                    Use LogQL to query logs in Grafana. Here are common examples:
                </p>

                <h3 className="text-lg font-semibold mb-3">All Logs from a Service</h3>
                <CodeBlock language="logql">
                    {`{service="api"}`}
                </CodeBlock>

                <h3 className="text-lg font-semibold mb-3 mt-6">Filter by Notification ID</h3>
                <CodeBlock language="logql">
                    {`{service="email-processor"} |= "notification_id"`}
                </CodeBlock>

                <h3 className="text-lg font-semibold mb-3 mt-6">Filter by Log Level</h3>
                <CodeBlock language="logql">
                    {`{service="worker"} | json | level="error"`}
                </CodeBlock>

                <h3 className="text-lg font-semibold mb-3 mt-6">Search Across All Services</h3>
                <CodeBlock language="logql">
                    {`{job="notification-service"} |= "failed"`}
                </CodeBlock>

                <h3 className="text-lg font-semibold mb-3 mt-6">Count Errors by Service</h3>
                <CodeBlock language="logql">
                    {`sum by (service) (count_over_time({job="notification-service"} | json | level="error" [1h]))`}
                </CodeBlock>

                <h3 className="text-lg font-semibold mb-3 mt-6">Request Rate</h3>
                <CodeBlock language="logql">
                    {`sum(rate({service="api"} |= "notification" [5m]))`}
                </CodeBlock>
            </section>

            {/* Log Labels */}
            <section id="log-labels">
                <h2 className="text-2xl font-bold mb-4">Log Labels</h2>
                <p className="text-muted-foreground mb-4">
                    All logs are tagged with these labels for filtering:
                </p>
                <DocsTable
                    headers={["Label", "Values", "Description"]}
                    rows={[
                        [
                            <code key="job" className="text-xs">job</code>,
                            <code key="job-val" className="text-xs">notification-service</code>,
                            "All services share this job name"
                        ],
                        [
                            <code key="service" className="text-xs">service</code>,
                            <code key="service-val" className="text-xs text-nowrap">api, worker, email-processor, whatsapp-processor, delayed-processor</code>,
                            "Individual service name"
                        ],
                        [
                            <code key="env" className="text-xs">environment</code>,
                            <code key="env-val" className="text-xs">development, production</code>,
                            "Deployment environment"
                        ],
                        [
                            <code key="worker" className="text-xs">worker_id</code>,
                            <code key="worker-val" className="text-xs text-nowrap">email-processor-1, etc.</code>,
                            "Unique identifier for processor instances"
                        ],
                    ]}
                />
            </section>

            {/* Kafka UI */}
            <section id="kafka-ui">
                <h2 className="text-2xl font-bold mb-4">Kafka UI</h2>
                <p className="text-muted-foreground mb-4">
                    Kafka UI provides a web interface for monitoring Kafka topics, consumers, and messages.
                </p>

                <h3 className="text-lg font-semibold mb-3">Access Kafka UI</h3>
                <p className="text-muted-foreground mb-4">
                    Open <a href="http://localhost:8080" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">http://localhost:8080</a> in your browser.
                </p>

                <h3 className="text-lg font-semibold mb-3 mt-6">Key Features</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-4">
                    <li><strong>Topics</strong> — View all topics, partition counts, and message counts</li>
                    <li><strong>Messages</strong> — Browse and search messages in topics</li>
                    <li><strong>Consumer Groups</strong> — Monitor consumer group lag and offsets</li>
                    <li><strong>Brokers</strong> — View broker health and configuration</li>
                </ul>

                <h3 className="text-lg font-semibold mb-3 mt-6">Topics to Monitor</h3>
                <DocsTable
                    headers={["Topic", "Purpose", "Monitor For"]}
                    rows={[
                        [
                            <code key="email" className="text-xs">email_notification</code>,
                            "Email delivery requests",
                            "Growing lag indicates slow processing"
                        ],
                        [
                            <code key="whatsapp" className="text-xs">whatsapp_notification</code>,
                            "WhatsApp delivery requests",
                            "Growing lag indicates slow processing"
                        ],
                        [
                            <code key="delayed" className="text-xs">delayed_notification</code>,
                            "Scheduled notifications",
                            "Messages should be consumed quickly"
                        ],
                        [
                            <code key="status" className="text-xs">notification_status</code>,
                            "Delivery status updates",
                            "Lag affects database update latency"
                        ],
                    ]}
                />

                <DocsCallout type="note" title="Consumer Lag">
                    Consumer lag is the difference between the latest message offset and the
                    consumer&apos;s current offset. High lag indicates the processors can&apos;t keep up.
                </DocsCallout>
            </section>

            {/* Admin Dashboard */}
            <section id="admin-dashboard">
                <h2 className="text-2xl font-bold mb-4">Admin Dashboard</h2>
                <p className="text-muted-foreground mb-4">
                    The built-in Admin Dashboard provides notification-specific monitoring:
                </p>

                <h3 className="text-lg font-semibold mb-3">Dashboard Features</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-4">
                    <li><strong>Overview</strong> — Total, delivered, pending, and failed notification counts</li>
                    <li><strong>Events Explorer</strong> — Paginated table with filtering and search</li>
                    <li><strong>Failed Events</strong> — View and batch-retry failed notifications</li>
                    <li><strong>Analytics</strong> — Charts for status and channel distribution</li>
                </ul>

                <h3 className="text-lg font-semibold mb-3 mt-6">Access</h3>
                <DocsTable
                    headers={["Setting", "Value"]}
                    rows={[
                        ["URL", <a key="url" href="http://localhost:3002" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">http://localhost:3002</a>],
                        ["Username", <code key="user" className="text-xs">admin</code>],
                        ["Password", <code key="pass" className="text-xs">admin</code>],
                    ]}
                />
            </section>

            {/* Log Configuration */}
            <section id="log-config">
                <h2 className="text-2xl font-bold mb-4">Log Configuration</h2>
                <p className="text-muted-foreground mb-4">
                    Configure logging behavior with these environment variables:
                </p>
                <DocsTable
                    headers={["Variable", "Description", "Default"]}
                    rows={[
                        [
                            <code key="loki" className="text-xs">LOKI_URL</code>,
                            "Grafana Loki URL for log shipping",
                            <code key="loki-val" className="text-xs">http://loki:3100</code>
                        ],
                        [
                            <code key="level" className="text-xs">LOG_LEVEL</code>,
                            "Minimum log level (debug, info, warn, error)",
                            <code key="level-val" className="text-xs">info</code>
                        ],
                        [
                            <code key="file" className="text-xs">LOG_TO_FILE</code>,
                            "Enable writing logs to files",
                            <code key="file-val" className="text-xs">true</code>
                        ],
                    ]}
                />

                <h3 className="text-lg font-semibold mb-3 mt-6">Log Levels</h3>
                <DocsTable
                    headers={["Level", "Use Case"]}
                    rows={[
                        [<code key="debug" className="text-xs">debug</code>, "Detailed debugging information"],
                        [<code key="info" className="text-xs">info</code>, "General operational information"],
                        [<code key="warn" className="text-xs">warn</code>, "Warning conditions"],
                        [<code key="error" className="text-xs">error</code>, "Error conditions"],
                    ]}
                />

                <DocsCallout type="warning" title="Debug in Production">
                    Avoid using <code>debug</code> level in production as it generates excessive
                    log volume and can impact performance.
                </DocsCallout>
            </section>

            {/* Alerting */}
            <section id="alerting">
                <h2 className="text-2xl font-bold mb-4">Setting Up Alerts</h2>
                <p className="text-muted-foreground mb-4">
                    Configure alerts in Grafana to be notified of issues:
                </p>

                <h3 className="text-lg font-semibold mb-3">Example Alert Rules</h3>

                <h4 className="font-semibold mb-2 mt-4">High Error Rate</h4>
                <CodeBlock language="logql">
                    {`sum(rate({job="notification-service"} | json | level="error" [5m])) > 10`}
                </CodeBlock>

                <h4 className="font-semibold mb-2 mt-4">Failed Notifications</h4>
                <CodeBlock language="logql">
                    {`count_over_time({service="email-processor"} |= "FAILED" [5m]) > 5`}
                </CodeBlock>

                <h4 className="font-semibold mb-2 mt-4">Service Down</h4>
                <CodeBlock language="logql">
                    {`absent_over_time({service="api"} [5m])`}
                </CodeBlock>

                <h3 className="text-lg font-semibold mb-3 mt-6">Alert Channels</h3>
                <p className="text-muted-foreground mb-4">
                    Configure alert notifications in Grafana under <strong>Alerting → Contact Points</strong>:
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>Email</li>
                    <li>Slack</li>
                    <li>PagerDuty</li>
                    <li>Discord</li>
                    <li>Webhook</li>
                </ul>
            </section>

            {/* Health Checks */}
            <section id="health-checks">
                <h2 className="text-2xl font-bold mb-4">Health Checks</h2>
                <p className="text-muted-foreground mb-4">
                    The API server exposes a health endpoint for monitoring:
                </p>
                <CodeBlock language="bash">
                    {`# Check API health
curl http://localhost:3000/health

# Response
{
  "status": "healthy",
  "timestamp": "2025-12-05T10:30:00.000Z"
}`}
                </CodeBlock>

                <h3 className="text-lg font-semibold mb-3 mt-6">Docker Health Checks</h3>
                <p className="text-muted-foreground mb-4">
                    All services have Docker health checks configured. View health status:
                </p>
                <CodeBlock language="bash">
                    {`# Check all container health
docker-compose ps

# View health check details for a container
docker inspect --format='{{json .State.Health}}' ns-api | jq`}
                </CodeBlock>
            </section>

            {/* Troubleshooting */}
            <section id="troubleshooting">
                <h2 className="text-2xl font-bold mb-4">Troubleshooting</h2>

                <h3 className="text-lg font-semibold mb-3">Logs Not Appearing in Grafana</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-4">
                    <li>Verify Loki is running: <code className="px-1.5 py-0.5 bg-muted rounded">docker-compose logs loki</code></li>
                    <li>Check <code className="px-1.5 py-0.5 bg-muted rounded">LOKI_URL</code> is set correctly</li>
                    <li>Ensure services can reach Loki on the Docker network</li>
                </ul>

                <h3 className="text-lg font-semibold mb-3 mt-4">High Consumer Lag</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-4">
                    <li>Scale up processor instances</li>
                    <li>Check for errors in processor logs</li>
                    <li>Verify rate limits aren&apos;t too restrictive</li>
                    <li>Increase partition count for more parallelism</li>
                </ul>

                <h3 className="text-lg font-semibold mb-3 mt-4">Notifications Stuck in Pending</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-4">
                    <li>Check if the background worker is running</li>
                    <li>Verify MongoDB connection</li>
                    <li>Check outbox polling interval settings</li>
                    <li>Check the <strong>Alerts</strong> page in the Admin Dashboard for <code className="px-1.5 py-0.5 bg-muted rounded">orphaned_pending</code> alerts</li>
                </ul>

                <h3 className="text-lg font-semibold mb-3 mt-4">Recovery Alerts</h3>
                <p className="text-muted-foreground mb-4">
                    The Recovery Service detects stuck notifications and creates alerts for manual inspection.
                    Check the Admin Dashboard <strong>Alerts</strong> page to manage these:
                </p>
                <DocsTable
                    headers={["Alert Type", "Meaning", "Action"]}
                    rows={[
                        [
                            <code key="gd" className="text-xs">ghost_delivery</code>,
                            "Notification delivered but DB not updated",
                            "Usually auto-recovered; check if status updated"
                        ],
                        [
                            <code key="sp" className="text-xs">stuck_processing</code>,
                            "Notification stuck in processing state",
                            "Retry via dashboard or investigate processor logs"
                        ],
                        [
                            <code key="op" className="text-xs">orphaned_pending</code>,
                            "Notification never picked up from outbox",
                            "Check background worker health, retry via dashboard"
                        ],
                    ]}
                />

                <h4 className="font-semibold mt-4 mb-2">LogQL Query for Recovery Service</h4>
                <CodeBlock language="bash">
                    {`# View recovery service activity
{service="recovery"} |= "stuck" OR |= "ghost" OR |= "orphaned"

# View created alerts
{service="recovery"} |= "Created alert"

# View auto-recovered notifications
{service="recovery"} |= "Ghost delivery detected"`}
                </CodeBlock>

                <DocsCallout type="tip" title="Proactive Monitoring">
                    Set up a Grafana alert rule to notify you when the count of unresolved alerts exceeds a threshold.
                    This helps catch systemic issues before they impact delivery rates.
                </DocsCallout>
            </section>
            <DocsNavGrid
                items={[
                    { link: "/docs/admin-dashboard", heading: "Admin Dashboard", subtitle: "Admin dashboard configuration" },
                    { link: "/docs", heading: "Overview", subtitle: "Learn what is SimpleNS" },
                    { link: "/docs/architecture", heading: "Architecture", subtitle: "Learn about the architecture of SimpleNS" },
                ]}
            />
        </div>
    );
}
