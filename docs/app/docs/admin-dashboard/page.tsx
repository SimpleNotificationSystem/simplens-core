import Image from "next/image";
import { CodeBlock } from "@/components/docs/code-block";
import { DocsCallout } from "@/components/docs/docs-callout";
import { DocsTable } from "@/components/docs/docs-table";
import { DocsNavGrid } from "@/components/docs/docs-nav-grid";
import { DocsTableOfContents } from "@/components/docs/docs-toc";

import {
    LayoutDashboard,
    ClipboardList,
    AlertCircle,
    BarChart3,
    Send,
    Lock,
    LucideIcon
} from "lucide-react";

interface FeatureCardProps {
    icon: LucideIcon;
    title: string;
    description: string;
}

function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
    return (
        <div className="p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-3 mb-2">
                <Icon className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">{title}</h3>
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
        </div>
    );
}

export default function AdminDashboardPage() {
    return (
        <div className="space-y-10">
            <section>
                <h1 className="text-4xl font-bold tracking-tight mb-4">Admin Dashboard</h1>
                <p className="text-xl text-muted-foreground">
                    Manage and monitor your notifications with the built-in admin dashboard.
                </p>
            </section>

            <DocsTableOfContents
                items={[
                    { id: "overview", label: "Overview" },
                    { id: "features", label: "Key Features" },
                    { id: "access", label: "Accessing the Dashboard" },
                    { id: "pages", label: "Dashboard Pages" },
                    { id: "configuration", label: "Configuration" },
                    { id: "local-setup", label: "Local Development" },
                    { id: "docker-setup", label: "Docker Setup" },
                    { id: "troubleshooting", label: "Troubleshooting" },
                ]}
            />

            {/* Overview */}
            <section id="overview">
                <h2 className="text-2xl font-bold mb-4">Overview</h2>
                <p className="text-muted-foreground mb-4">
                    The SimpleNS Admin Dashboard provides a user-friendly web interface for managing your
                    notification service. It allows you to monitor notification status, view analytics,
                    retry failed notifications, and send new notifications directly from the browser.
                </p>
                <div className="rounded-lg border overflow-hidden bg-card">
                    <Image
                        src="/DashboardUI.png"
                        alt="SimpleNS Admin Dashboard"
                        width={1200}
                        height={600}
                        className="w-full h-auto"
                    />
                </div>
            </section>

            {/* Features */}
            <section id="features">
                <h2 className="text-2xl font-bold mb-4">Key Features</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FeatureCard
                        icon={LayoutDashboard}
                        title="Dashboard Overview"
                        description="View total, delivered, pending, and failed notification counts at a glance. Get real-time statistics on your notification pipeline."
                    />
                    <FeatureCard
                        icon={ClipboardList}
                        title="Events Explorer"
                        description="Browse all notifications with a paginated table. Filter by status, channel, and search by request ID or recipient."
                    />
                    <FeatureCard
                        icon={AlertCircle}
                        title="Failed Events Inspector"
                        description="View failed notifications with detailed error messages. Batch retry failed notifications with a single click."
                    />
                    <FeatureCard
                        icon={BarChart3}
                        title="Analytics"
                        description="Visualize notification distribution with charts. See status breakdown and channel distribution over time."
                    />
                    <FeatureCard
                        icon={Send}
                        title="Send Notifications"
                        description="Send single or batch notifications directly from the dashboard. Test your notification setup without writing code."
                    />
                    <FeatureCard
                        icon={Lock}
                        title="Authentication"
                        description="Secure login with username/password authentication. Session management with NextAuth.js."
                    />
                </div>
            </section>

            {/* Access */}
            <section id="access">
                <h2 className="text-2xl font-bold mb-4">Accessing the Dashboard</h2>
                <DocsTable
                    headers={["Setting", "Value"]}
                    rows={[
                        ["URL", <a key="url" href="http://localhost:3002" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">http://localhost:3002</a>],
                        ["Default Username", <code key="user" className="text-sm">admin</code>],
                        ["Default Password", <code key="pass" className="text-sm">admin</code>],
                    ]}
                />
                <DocsCallout type="warning" title="Change Default Credentials">
                    Always change the default credentials in production using the
                    <code className="mx-1">ADMIN_USERNAME</code> and <code className="mx-1">ADMIN_PASSWORD</code>
                    environment variables.
                </DocsCallout>
            </section>

            {/* Dashboard Pages */}
            <section id="pages">
                <h2 className="text-2xl font-bold mb-4">Dashboard Pages</h2>

                <h3 className="text-xl font-semibold mb-3">Dashboard Home</h3>
                <p className="text-muted-foreground mb-4">
                    The main dashboard page shows key metrics at a glance:
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-6">
                    <li><strong>Total Notifications</strong> — All-time count of notifications sent</li>
                    <li><strong>Delivered</strong> — Successfully delivered notifications</li>
                    <li><strong>Pending</strong> — Notifications waiting to be processed</li>
                    <li><strong>Failed</strong> — Notifications that failed after all retries</li>
                    <li><strong>Recent Activity</strong> — Latest notifications with status</li>
                </ul>

                <h3 className="text-xl font-semibold mb-3">Events Explorer</h3>
                <p className="text-muted-foreground mb-4">
                    The Events page provides a complete view of all notifications:
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-6">
                    <li><strong>Paginated Table</strong> — Browse through all notifications efficiently</li>
                    <li><strong>Status Filter</strong> — Filter by pending, processing, delivered, or failed</li>
                    <li><strong>Channel Filter</strong> — Filter by email or WhatsApp</li>
                    <li><strong>Search</strong> — Find notifications by request ID, client ID, or recipient</li>
                    <li><strong>Details View</strong> — Click any notification to see full details</li>
                </ul>

                <h3 className="text-xl font-semibold mb-3">Failed Events</h3>
                <p className="text-muted-foreground mb-4">
                    The Failed page focuses on notifications that need attention:
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-6">
                    <li><strong>Error Details</strong> — View the exact error message for each failure</li>
                    <li><strong>Retry History</strong> — See how many retry attempts were made</li>
                    <li><strong>Single Retry</strong> — Retry individual notifications</li>
                    <li><strong>Batch Retry</strong> — Select multiple notifications and retry all at once</li>
                </ul>

                <h3 className="text-xl font-semibold mb-3">Analytics</h3>
                <p className="text-muted-foreground mb-4">
                    The Analytics page provides visual insights:
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-6">
                    <li><strong>Status Distribution</strong> — Pie chart showing notification status breakdown</li>
                    <li><strong>Channel Distribution</strong> — See email vs WhatsApp usage</li>
                    <li><strong>Trends</strong> — Line charts showing notification volume over time</li>
                </ul>

                <h3 className="text-xl font-semibold mb-3">Send Notifications</h3>
                <p className="text-muted-foreground mb-4">
                    The Send page allows you to send notifications directly from the dashboard:
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-6">
                    <li><strong>Single Notification</strong> — Send to one recipient with full customization</li>
                    <li><strong>Batch Notification</strong> — Send to multiple recipients with template variables</li>
                    <li><strong>Channel Selection</strong> — Choose email, WhatsApp, or both</li>
                    <li><strong>Scheduled Delivery</strong> — Set a future delivery time</li>
                    <li><strong>Real-time Feedback</strong> — See the webhook response in the dashboard</li>
                </ul>
            </section>

            {/* Configuration */}
            <section id="configuration">
                <h2 className="text-2xl font-bold mb-4">Configuration</h2>
                <p className="text-muted-foreground mb-4">
                    Configure the Admin Dashboard using these environment variables:
                </p>
                <DocsTable
                    headers={["Variable", "Description", "Default"]}
                    rows={[
                        [
                            <code key="secret" className="text-xs">AUTH_SECRET</code>,
                            "NextAuth session encryption secret",
                            <span key="secret-val" className="text-red-500 dark:text-red-400">Required</span>
                        ],
                        [
                            <code key="user" className="text-xs">ADMIN_USERNAME</code>,
                            "Dashboard login username",
                            <code key="user-val" className="text-xs">admin</code>
                        ],
                        [
                            <code key="pass" className="text-xs">ADMIN_PASSWORD</code>,
                            "Dashboard login password",
                            <code key="pass-val" className="text-xs">admin</code>
                        ],
                        [
                            <code key="api" className="text-xs">API_BASE_URL</code>,
                            "Notification service API URL",
                            <code key="api-val" className="text-xs">http://localhost:3000</code>
                        ],
                        [
                            <code key="apikey" className="text-xs">NS_API_KEY</code>,
                            "API key for sending notifications",
                            <span key="apikey-val" className="text-red-500 dark:text-red-400">Required</span>
                        ],
                        [
                            <code key="mongo" className="text-xs">MONGO_URI</code>,
                            "MongoDB connection string",
                            <span key="mongo-val" className="text-muted-foreground">From main service</span>
                        ],
                    ]}
                />
            </section>

            {/* Local Development */}
            <section id="local-setup">
                <h2 className="text-2xl font-bold mb-4">Local Development</h2>
                <p className="text-muted-foreground mb-4">
                    To run the Admin Dashboard locally for development:
                </p>
                <CodeBlock language="bash">
                    {`# Navigate to the dashboard directory
cd dashboard

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Start development server
npm run dev`}
                </CodeBlock>
                <p className="text-muted-foreground mt-4">
                    The dashboard will be available at <code className="px-1.5 py-0.5 bg-muted rounded">http://localhost:3002</code>
                </p>
            </section>

            {/* Docker Setup */}
            <section id="docker-setup">
                <h2 className="text-2xl font-bold mb-4">Docker Setup</h2>
                <p className="text-muted-foreground mb-4">
                    The dashboard is included in the Docker Compose setup:
                </p>
                <CodeBlock language="bash">
                    {`# Start all services including dashboard
docker-compose up -d

# View dashboard logs
docker-compose logs -f dashboard`}
                </CodeBlock>
                <DocsCallout type="note" title="Environment Variables">
                    When running with Docker Compose, environment variables are configured in the
                    <code className="mx-1">docker-compose.yml</code> file.
                </DocsCallout>
            </section>

            {/* Troubleshooting */}
            <section id="troubleshooting">
                <h2 className="text-2xl font-bold mb-4">Troubleshooting</h2>

                <h3 className="text-lg font-semibold mb-3">Cannot Login</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-4">
                    <li>Check <code className="px-1.5 py-0.5 bg-muted rounded">AUTH_SECRET</code> is set</li>
                    <li>Verify <code className="px-1.5 py-0.5 bg-muted rounded">ADMIN_USERNAME</code> and <code className="px-1.5 py-0.5 bg-muted rounded">ADMIN_PASSWORD</code> match your input</li>
                    <li>Clear browser cookies and try again</li>
                </ul>

                <h3 className="text-lg font-semibold mb-3 mt-4">Events Not Loading</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-4">
                    <li>Verify MongoDB connection string is correct</li>
                    <li>Check that the notification service has written data to MongoDB</li>
                    <li>Ensure the dashboard can reach MongoDB (check network/firewall)</li>
                </ul>

                <h3 className="text-lg font-semibold mb-3 mt-4">Send Notification Fails</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-4">
                    <li>Verify <code className="px-1.5 py-0.5 bg-muted rounded">API_BASE_URL</code> points to the correct API server</li>
                    <li>Check <code className="px-1.5 py-0.5 bg-muted rounded">NS_API_KEY</code> matches the API server key</li>
                    <li>Ensure the API server is running and healthy</li>
                </ul>
            </section>

            <DocsNavGrid
                items={[
                    { link: "/docs", heading: "Overview", subtitle: "Learn what is SimpleNS" },
                    { link: "/docs/architecture", heading: "Architecture", subtitle: "Learn about the architecture of SimpleNS" },
                    { link: "/docs/api-reference", heading: "API Reference", subtitle: "Learn about the API reference of SimpleNS" },
                ]}
            />
        </div>
    );
}
