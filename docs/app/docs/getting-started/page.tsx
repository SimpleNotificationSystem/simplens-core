import { CodeBlock } from "@/components/docs/code-block";
import { DocsCallout } from "@/components/docs/docs-callout";
import { DocsTable } from "@/components/docs/docs-table";
import { DocsNavGrid } from "@/components/docs/docs-nav-grid";
import { DocsTableOfContents } from "@/components/docs/docs-toc";

export default function GettingStartedPage() {
    return (
        <div className="space-y-10">
            <section>
                <h1 className="text-4xl font-bold tracking-tight mb-4">Getting Started</h1>
                <p className="text-xl text-muted-foreground">
                    Get SimpleNS up and running in minutes with Docker or local development setup.
                </p>
            </section>

            <DocsTableOfContents
                items={[
                    { id: "prerequisites", label: "Prerequisites" },
                    { id: "docker-setup", label: "Quick Start with Docker" },
                    { id: "local-setup", label: "Local Development Setup" },
                    { id: "service-ports", label: "Service Ports" },
                    { id: "dashboard-access", label: "Dashboard Access" },
                ]}
            />
            {/* Prerequisites */}
            <section id="prerequisites">
                <h2 className="text-2xl font-bold mb-4">Prerequisites</h2>
                <p className="text-muted-foreground mb-4">
                    Before you begin, ensure you have the following installed:
                </p>

                <h3 className="text-lg font-semibold mb-2">For Docker Setup (Recommended)</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-6">
                    <li>Docker Engine 20.10 or later</li>
                    <li>Docker Compose 2.0 or later</li>
                </ul>

                <h3 className="text-lg font-semibold mb-2">For Local Development</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-4">
                    <li>Node.js 20 or later</li>
                    <li>MongoDB 7.0+ (replica set mode)</li>
                    <li>Apache Kafka</li>
                    <li>Redis 7+</li>
                </ul>

                <DocsCallout type="tip" title="Docker Recommended">
                    We recommend using Docker for the quickest setup. It automatically configures
                    all infrastructure services (MongoDB, Kafka, Redis) with correct settings.
                </DocsCallout>
            </section>

            {/* Quick Start with Docker */}
            <section id="docker-setup">
                <h2 className="text-2xl font-bold mb-4">Quick Start with Docker</h2>
                <p className="text-muted-foreground mb-6">
                    Follow these steps to get SimpleNS running with Docker Compose:
                </p>

                <h3 className="text-lg font-semibold mb-2">1. Clone the Repository</h3>
                <CodeBlock language="bash">
                    {`git clone https://github.com/Adhish-Krishna/backend-notification-service.git
cd backend-notification-service`}
                </CodeBlock>

                <h3 className="text-lg font-semibold mb-2 mt-6">2. Configure Environment Variables</h3>
                <p className="text-muted-foreground mb-4">
                    Copy the example environment file and configure your settings:
                </p>
                <CodeBlock language="bash">
                    {`# Copy example env file
cp .env.example .env

# Edit .env and set required values:
# - NS_API_KEY (generate with: openssl rand -base64 32)
# - EMAIL_USER, EMAIL_PASS, EMAIL_FROM (for email delivery)`}
                </CodeBlock>

                <DocsCallout type="important" title="API Key">
                    The <code>NS_API_KEY</code> is required for authenticating API requests.
                    Generate a secure key using <code>openssl rand -base64 32</code>.
                </DocsCallout>

                <h3 className="text-lg font-semibold mb-2 mt-6">3. Build and Start Services</h3>
                <CodeBlock language="bash">
                    {`# Build the Docker images
docker-compose build

# Start all services in detached mode
docker-compose up -d`}
                </CodeBlock>

                <h3 className="text-lg font-semibold mb-2 mt-6">4. Verify Services are Running</h3>
                <CodeBlock language="bash">
                    {`# Check all containers
docker-compose ps

# Check API health
curl http://localhost:3000/health

# View logs
docker-compose logs -f api
docker-compose logs -f email-processor`}
                </CodeBlock>

                <h3 className="text-lg font-semibold mb-2 mt-6">5. Send a Test Notification</h3>
                <CodeBlock language="bash">
                    {`curl -X POST http://localhost:3000/api/notification \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "request_id": "replace a unique UUIDV4",
    "client_id": "replace a unique UUIDV4",
    "channel": ["email"],
    "recipient": {
      "user_id": "user-1",
      "email": "recipient@example.com"
    },
    "content": {
      "email": {
        "subject": "Hello!",
        "message": "<h1>Welcome!</h1><p>This is a test notification.</p>"
      }
    },
    "webhook_url": "https://your-webhook.com/callback"
  }'`}
                </CodeBlock>

                <h3 className="text-lg font-semibold mb-2 mt-6">6. Stop Services</h3>
                <CodeBlock language="bash">
                    {`# Stop all services
docker-compose down

# Stop and remove volumes (data)
docker-compose down -v`}
                </CodeBlock>
            </section>

            {/* Local Development Setup */}
            <section id="local-setup">
                <h2 className="text-2xl font-bold mb-4">Local Development Setup</h2>
                <p className="text-muted-foreground mb-6">
                    For development, you can run the application services locally while using Docker
                    for infrastructure (MongoDB, Kafka, Redis).
                </p>

                <h3 className="text-lg font-semibold mb-2">1. Install Dependencies</h3>
                <CodeBlock language="bash">
                    {`npm install`}
                </CodeBlock>

                <h3 className="text-lg font-semibold mb-2 mt-6">2. Start Infrastructure Only</h3>
                <p className="text-muted-foreground mb-4">
                    Start only the infrastructure services with Docker:
                </p>
                <CodeBlock language="bash">
                    {`# Start MongoDB, Kafka, Redis (without app services)
docker-compose up -d mongo kafka redis kafka-ui`}
                </CodeBlock>

                <h3 className="text-lg font-semibold mb-2 mt-6">3. Configure Environment</h3>
                <CodeBlock language="bash">
                    {`cp .env.example .env
# Edit .env with your local settings`}
                </CodeBlock>

                <h3 className="text-lg font-semibold mb-2 mt-6">4. Build TypeScript</h3>
                <CodeBlock language="bash">
                    {`npm run build`}
                </CodeBlock>

                <h3 className="text-lg font-semibold mb-2 mt-6">5. Run Services in Separate Terminals</h3>
                <p className="text-muted-foreground mb-4">
                    Open 5 terminal windows and run each service:
                </p>
                <CodeBlock language="bash">
                    {`# Terminal 1: API Server
npm run dev

# Terminal 2: Background Worker
npm run worker:dev

# Terminal 3: Email Processor
npm run email-processor:dev

# Terminal 4: WhatsApp Processor
npm run whatsapp-processor:dev

# Terminal 5: Delayed Processor
npm run delayed-processor:dev

# Terminal 6: Recovery Service
npm run recovery:dev`}
                </CodeBlock>

                <DocsCallout type="tip" title="Hot Reload">
                    The dev scripts use <code>ts-node</code> with watch mode for automatic
                    reloading when you make code changes.
                </DocsCallout>
            </section>

            {/* Service Ports */}
            <section id="service-ports">
                <h2 className="text-2xl font-bold mb-4">Service Ports</h2>
                <p className="text-muted-foreground mb-4">
                    After starting all services, you can access:
                </p>
                <DocsTable
                    headers={["Service", "URL", "Description"]}
                    rows={[
                        ["API Server", <a key="api" href="http://localhost:3000" className="text-primary hover:underline">http://localhost:3000</a>, "Notification API"],
                        ["Admin Dashboard", <a key="dashboard" href="http://localhost:3002" className="text-primary hover:underline">http://localhost:3002</a>, "Web dashboard"],
                        ["Grafana", <a key="grafana" href="http://localhost:3001" className="text-primary hover:underline">http://localhost:3001</a>, "Log visualization"],
                        ["Kafka UI", <a key="kafka" href="http://localhost:8080" className="text-primary hover:underline">http://localhost:8080</a>, "Kafka monitoring"],
                    ]}
                />
            </section>

            {/* Dashboard Access */}
            <section id="dashboard-access">
                <h2 className="text-2xl font-bold mb-4">Dashboard Access</h2>
                <p className="text-muted-foreground mb-4">
                    The Admin Dashboard is available at <code className="px-1.5 py-0.5 bg-muted rounded">http://localhost:3002</code>
                </p>
                <DocsTable
                    headers={["Setting", "Default Value"]}
                    rows={[
                        ["URL", <code key="url" className="text-sm">http://localhost:3002</code>],
                        ["Username", <code key="user" className="text-sm">admin</code>],
                        ["Password", <code key="pass" className="text-sm">admin</code>],
                    ]}
                />
                <DocsCallout type="warning" title="Change Default Credentials">
                    In production, always change the default credentials using the
                    <code className="mx-1">ADMIN_USERNAME</code> and <code className="mx-1">ADMIN_PASSWORD</code>
                    environment variables.
                </DocsCallout>
            </section>

            <DocsNavGrid
                items={[
                    { link: "/docs/configuration", heading: "Configuration", subtitle: "All environment variables explained" },
                    { link: "/docs/scaling", heading: "Scaling", subtitle: "Horizontal scaling and high throughput" },
                    { link: "/docs/monitoring", heading: "Monitoring", subtitle: "Set up logging and observability" },
                ]}
            />
        </div>
    );
}
