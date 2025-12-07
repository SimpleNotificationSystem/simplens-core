import { CodeBlock } from "@/components/docs/code-block";
import { DocsCallout } from "@/components/docs/docs-callout";
import { DocsTable, FieldTable } from "@/components/docs/docs-table";
import { DocsNavGrid } from "@/components/docs/docs-nav-grid";
import { DocsTableOfContents } from "@/components/docs/docs-toc";

export default function ApiReferencePage() {
    return (
        <div className="space-y-10">
            <section>
                <h1 className="text-4xl font-bold tracking-tight mb-4">API Reference</h1>
                <p className="text-xl text-muted-foreground">
                    Complete API documentation for the SimpleNS notification service.
                </p>
            </section>

            <DocsTableOfContents
                items={[
                    { id: "overview", label: "Overview" },
                    { id: "authentication", label: "Authentication" },
                    { id: "common-concepts", label: "Common Concepts" },
                    { id: "health-check", label: "Health Check" },
                    { id: "send-single", label: "Send Single Notification" },
                    { id: "send-batch", label: "Send Batch Notifications" },
                    { id: "webhooks", label: "Webhook Callbacks" },
                    { id: "errors", label: "Error Responses" },
                    { id: "examples", label: "Examples" },
                ]}
            />
            {/* Overview */}
            <section id="overview">
                <h2 className="text-2xl font-bold mb-4">Overview</h2>
                <DocsTable
                    headers={["Property", "Value"]}
                    rows={[
                        ["Base URL", <code key="url" className="text-sm">http://localhost:3000</code>],
                        ["Content-Type", <code key="ct" className="text-sm">application/json</code>],
                        ["Authentication", "Bearer Token"],
                    ]}
                />
            </section>

            {/* Authentication */}
            <section id="authentication">
                <h2 className="text-2xl font-bold mb-4">Authentication</h2>
                <p className="text-muted-foreground mb-4">
                    All <code className="px-1.5 py-0.5 bg-muted rounded">/api/notification</code> endpoints require
                    authentication via Bearer token in the Authorization header.
                </p>
                <CodeBlock language="http">
                    {`Authorization: Bearer <your_api_key>`}
                </CodeBlock>
                <DocsCallout type="tip" title="Generating an API Key">
                    Generate a secure API key using: <code>openssl rand -base64 32</code>
                </DocsCallout>
            </section>

            {/* Common Concepts */}
            <section id="common-concepts">
                <h2 className="text-2xl font-bold mb-6">Common Concepts</h2>

                <h3 className="text-xl font-semibold mb-3">Channels</h3>
                <p className="text-muted-foreground mb-4">
                    SimpleNS supports two notification channels:
                </p>
                <DocsTable
                    headers={["Channel", "Value", "Description"]}
                    rows={[
                        ["Email", <code key="email" className="text-sm">email</code>, "Send via SMTP (Gmail, custom SMTP)"],
                        ["WhatsApp", <code key="wa" className="text-sm">whatsapp</code>, "Send via WhatsApp Business API"],
                    ]}
                />

                <h3 className="text-xl font-semibold mb-3 mt-8">Idempotency</h3>
                <p className="text-muted-foreground mb-4">
                    The service ensures <strong>exactly-once delivery</strong> using the combination of
                    <code className="px-1.5 py-0.5 bg-muted rounded mx-1">request_id</code> +
                    <code className="px-1.5 py-0.5 bg-muted rounded mx-1">channel</code>:
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-4">
                    <li>Duplicate requests with status <code className="px-1.5 py-0.5 bg-muted rounded">pending</code>, <code className="px-1.5 py-0.5 bg-muted rounded">processing</code>, or <code className="px-1.5 py-0.5 bg-muted rounded">delivered</code> are rejected</li>
                    <li>If existing notification has status <code className="px-1.5 py-0.5 bg-muted rounded">failed</code>, a new notification is allowed (retry scenario)</li>
                </ul>

                <h3 className="text-xl font-semibold mb-3 mt-8">Template Variables</h3>
                <p className="text-muted-foreground mb-4">
                    Personalize messages using template variables with the syntax <code className="px-1.5 py-0.5 bg-muted rounded">{"{{variable_name}}"}</code>.
                </p>
                <CodeBlock language="html">
                    {`<h1>Hello, {{name}}!</h1>
<p>Your order #{{order_id}} has been shipped.</p>
<p>Tracking: {{tracking_number}}</p>`}
                </CodeBlock>
            </section>

            {/* Health Check Endpoint */}
            <section id="health-check">
                <h2 className="text-2xl font-bold mb-4">Health Check</h2>
                <div className="flex items-center gap-2 mb-4">
                    <span className="px-2 py-1 rounded bg-green-500/20 text-green-600 dark:text-green-400 text-sm font-mono font-semibold">
                        GET
                    </span>
                    <code className="text-lg">/health</code>
                </div>
                <p className="text-muted-foreground mb-4">
                    Check if the API server is running. This endpoint does not require authentication.
                </p>
                <h4 className="font-semibold mb-2">Response (200 OK)</h4>
                <CodeBlock language="json">
                    {`{
  "status": "healthy",
  "timestamp": "2025-12-05T10:30:00.000Z"
}`}
                </CodeBlock>
            </section>

            {/* POST /notification */}
            <section id="send-single">
                <h2 className="text-2xl font-bold mb-4">Send Single Notification</h2>
                <div className="flex items-center gap-2 mb-4">
                    <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-600 dark:text-blue-400 text-sm font-mono font-semibold">
                        POST
                    </span>
                    <code className="text-lg">/api/notification</code>
                </div>
                <p className="text-muted-foreground mb-6">
                    Send a single notification to one recipient. Supports multiple channels per request.
                </p>

                <h4 className="font-semibold mb-2">Request Body</h4>
                <CodeBlock language="json">
                    {`{
  "request_id": "unique UUIDV4 request-id",
  "client_id": "your UUIDV4 client-id",
  "client_name": "Your App Name",
  "channel": ["email", "whatsapp"],
  "recipient": {
    "user_id": "user-123",
    "email": "user@example.com",
    "phone": "+15551234567"
  },
  "content": {
    "email": {
      "subject": "Welcome to Our Service!",
      "message": "<h1>Hello!</h1><p>Thank you for signing up.</p>"
    },
    "whatsapp": {
      "message": "Hello! Thank you for signing up."
    }
  },
  "scheduled_at": "2025-12-10T15:30:00Z",
  "webhook_url": "https://your-app.com/webhooks/notification"
}`}
                </CodeBlock>

                <h4 className="font-semibold mb-2 mt-6">Field Reference</h4>
                <FieldTable
                    fields={[
                        { name: "request_id", type: "UUID v4", required: true, description: "Unique identifier for idempotency (must be valid UUID v4)" },
                        { name: "client_id", type: "UUID v4", required: true, description: "Your application/client identifier (must be valid UUID v4)" },
                        { name: "client_name", type: "string", required: false, description: "Optional display name for your application" },
                        { name: "channel", type: "Array<'email' | 'whatsapp'>", required: true, description: "Array of channels to send notification through" },
                        { name: "recipient", type: "object", required: true, description: "Recipient details object" },
                        { name: "recipient.user_id", type: "string", required: true, description: "User identifier for tracking" },
                        { name: "recipient.email", type: "email", required: "conditional", description: "Valid email address (required if channel includes 'email')" },
                        { name: "recipient.phone", type: "string", required: "conditional", description: "Phone number (required if channel includes 'whatsapp')" },
                        { name: "content", type: "object", required: true, description: "Message content per channel" },
                        { name: "content.email.subject", type: "string", required: false, description: "Email subject line (optional)" },
                        { name: "content.email.message", type: "string", required: "conditional", description: "Email body - HTML supported (required if channel includes 'email')" },
                        { name: "content.whatsapp.message", type: "string", required: "conditional", description: "WhatsApp message text (required if channel includes 'whatsapp')" },
                        { name: "scheduled_at", type: "Date (ISO 8601)", required: false, description: "Schedule delivery for future time (coerced to Date)" },
                        { name: "webhook_url", type: "URL", required: true, description: "Valid URL for delivery status callbacks" },
                    ]}
                />

                <h4 className="font-semibold mb-2 mt-6">Response (202 Accepted)</h4>
                <CodeBlock language="json">
                    {`{
  "message": "Notifications are being processed"
}`}
                </CodeBlock>
            </section>

            {/* POST /notification/batch */}
            <section id="send-batch">
                <h2 className="text-2xl font-bold mb-4">Send Batch Notifications</h2>
                <div className="flex items-center gap-2 mb-4">
                    <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-600 dark:text-blue-400 text-sm font-mono font-semibold">
                        POST
                    </span>
                    <code className="text-lg">/api/notification/batch</code>
                </div>
                <p className="text-muted-foreground mb-6">
                    Send the same notification content to multiple recipients. Ideal for announcements,
                    marketing campaigns, or bulk notifications. Use template variables to personalize each message.
                </p>

                <h4 className="font-semibold mb-2">Request Body</h4>
                <CodeBlock language="json">
                    {`{
  "client_id": "your UUIDV4 client-id",
  "client_name": "Your App Name",
  "channel": ["email"],
  "content": {
    "email": {
      "subject": "Special Offer for {{name}}!",
      "message": "<h1>Hi {{name}}!</h1><p>Use code {{promo_code}} for 20% off.</p>"
    }
  },
  "recipients": [
    {
      "request_id": "unique UUIDV4 request-id",
      "user_id": "user-1",
      "email": "alice@example.com",
      "variables": {
        "name": "Alice",
        "promo_code": "ALICE20"
      }
    },
    {
      "request_id": "unique UUIDV4 request-id",
      "user_id": "user-2",
      "email": "bob@example.com",
      "variables": {
        "name": "Bob",
        "promo_code": "BOB20"
      }
    }
  ],
  "scheduled_at": "2025-12-10T09:00:00Z",
  "webhook_url": "https://your-app.com/webhooks/notification"
}`}
                </CodeBlock>

                <DocsCallout type="note" title="Counting Notifications">
                    Each recipient × channel combination counts as one notification.
                    100 recipients with 2 channels = 200 notifications.
                </DocsCallout>

                <h4 className="font-semibold mb-2 mt-6">Field Reference</h4>
                <FieldTable
                    fields={[
                        { name: "client_id", type: "UUID v4", required: true, description: "Your application/client identifier (must be valid UUID v4)" },
                        { name: "client_name", type: "string", required: false, description: "Optional display name for your application" },
                        { name: "channel", type: "Array<'email' | 'whatsapp'>", required: true, description: "Channels to send notifications through (applies to all recipients)" },
                        { name: "content", type: "object", required: true, description: "Shared message template (supports {{variables}} syntax)" },
                        { name: "content.email.subject", type: "string", required: false, description: "Email subject line (optional, supports {{variables}})" },
                        { name: "content.email.message", type: "string", required: "conditional", description: "Email body - HTML supported (required if channel includes 'email')" },
                        { name: "content.whatsapp.message", type: "string", required: "conditional", description: "WhatsApp message text (required if channel includes 'whatsapp')" },
                        { name: "recipients", type: "Array<object>", required: true, description: "Array of recipient objects (max: MAX_BATCH_REQ_LIMIT × channels)" },
                        { name: "recipients[].request_id", type: "UUID v4", required: true, description: "Unique ID per recipient for idempotency (must be valid UUID v4)" },
                        { name: "recipients[].user_id", type: "string", required: true, description: "User identifier for tracking" },
                        { name: "recipients[].email", type: "email", required: "conditional", description: "Valid email address (required if channel includes 'email')" },
                        { name: "recipients[].phone", type: "string", required: "conditional", description: "Phone number (required if channel includes 'whatsapp')" },
                        { name: "recipients[].variables", type: "Record<string, string>", required: false, description: "Key-value pairs for template variable substitution" },
                        { name: "scheduled_at", type: "Date (ISO 8601)", required: false, description: "Schedule delivery for future time (applies to all recipients)" },
                        { name: "webhook_url", type: "URL", required: true, description: "Valid URL for delivery status callbacks" },
                    ]}
                />
            </section>

            {/* Webhook Callbacks */}
            <section id="webhooks">
                <h2 className="text-2xl font-bold mb-4">Webhook Callbacks</h2>
                <p className="text-muted-foreground mb-4">
                    When a notification is delivered or fails, the service sends a POST request to your
                    <code className="px-1.5 py-0.5 bg-muted rounded mx-1">webhook_url</code>.
                </p>

                <h4 className="font-semibold mb-2">Webhook Payload</h4>
                <CodeBlock language="json">
                    {`{
  "request_id": "unique UUIDV4 request-id",
  "client_id": "your UUIDV4 client-id",
  "notification_id": "your MongoDB ObjectId notification-id",
  "status": "DELIVERED or FAILED",
  "channel": "email or whatsapp",
  "message": "Email sent successfully or error reason",
  "occurred_at": "ISO 8601 timestamp"
}`}
                </CodeBlock>

                <h4 className="font-semibold mb-2 mt-6">Webhook Fields</h4>
                <DocsTable
                    headers={["Field", "Type", "Description"]}
                    rows={[
                        [<code key="rid" className="text-xs">request_id</code>, "UUIDV4", "Your original request ID"],
                        [<code key="cid" className="text-xs">client_id</code>, "UUIDV4", "Your client ID"],
                        [<code key="nid" className="text-xs">notification_id</code>, "MongoDB ObjectId", "Internal notification ID"],
                        [<code key="status" className="text-xs">status</code>, "string", "DELIVERED or FAILED"],
                        [<code key="channel" className="text-xs">channel</code>, "string", "email or whatsapp"],
                        [<code key="msg" className="text-xs">message</code>, "string", "Success message or error reason"],
                        [<code key="time" className="text-xs">occurred_at</code>, "Date", "ISO 8601 timestamp"],
                    ]}
                />

                <DocsCallout type="warning" title="Webhook Reliability">
                    Webhooks may be delivered more than once. Implement idempotent handling
                    using the <code>notification_id</code> field.
                </DocsCallout>

                <h4 className="font-semibold mb-2 mt-6">Docker Webhook URLs</h4>
                <p className="text-muted-foreground mb-4">
                    When running SimpleNS in Docker and your webhook server is on the host:
                </p>
                <DocsTable
                    headers={["Service Location", "Webhook URL"]}
                    rows={[
                        ["Both on host", <code key="host" className="text-xs">http://localhost:4000/webhook</code>],
                        ["SimpleNS in Docker, webhook on host", <code key="docker-host" className="text-xs">http://host.docker.internal:4000/webhook</code>],
                        ["Both in Docker (same network)", <code key="docker" className="text-xs">http://container-name:4000/webhook</code>],
                    ]}
                />
            </section>

            {/* Error Responses */}
            <section id="errors">
                <h2 className="text-2xl font-bold mb-4">Error Responses</h2>
                <p className="text-muted-foreground mb-4">
                    All error responses follow this format:
                </p>
                <CodeBlock language="json">
                    {`{
  "message": "Human-readable error message",
  "errors": [
    { "path": "field.path", "message": "Specific error" }
  ]
}`}
                </CodeBlock>

                <h4 className="font-semibold mb-2 mt-6">HTTP Status Codes</h4>
                <DocsTable
                    headers={["Code", "Description"]}
                    rows={[
                        [<code key="200" className="text-sm font-semibold text-green-600">200</code>, "Success (health check)"],
                        [<code key="202" className="text-sm font-semibold text-green-600">202</code>, "Accepted — notification queued"],
                        [<code key="400" className="text-sm font-semibold text-yellow-600">400</code>, "Bad Request — validation error"],
                        [<code key="401" className="text-sm font-semibold text-red-600">401</code>, "Unauthorized — invalid API key"],
                        [<code key="409" className="text-sm font-semibold text-yellow-600">409</code>, "Conflict — duplicate notification"],
                        [<code key="500" className="text-sm font-semibold text-red-600">500</code>, "Internal Server Error"],
                    ]}
                />
            </section>

            {/* Examples */}
            <section id="examples">
                <h2 className="text-2xl font-bold mb-4">Examples</h2>

                <h4 className="font-semibold mb-2">Send Welcome Email</h4>
                <CodeBlock language="bash">
                    {`curl -X POST http://localhost:3000/api/notification \\
  -H "Authorization: Bearer your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "request_id": UUIDV4,
    "client_id": UUIDV4,
    "channel": ["email"],
    "recipient": {
      "user_id": "user-123",
      "email": "newuser@example.com"
    },
    "content": {
      "email": {
        "subject": "Welcome to Our Platform!",
        "message": "<h1>Welcome!</h1><p>We are excited to have you.</p>"
      }
    },
    "webhook_url": "https://my-app.com/webhooks"
  }'`}
                </CodeBlock>

                <h4 className="font-semibold mb-2 mt-6">Send Batch with Variables</h4>
                <CodeBlock language="bash">
                    {`curl -X POST http://localhost:3000/api/notification/batch \\
  -H "Authorization: Bearer your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "client_id": UUIDV4,
    "channel": ["email"],
    "content": {
      "email": {
        "subject": "Weekly Summary, {{name}}",
        "message": "<p>Hi {{name}}, you completed {{tasks}} tasks!</p>"
      }
    },
    "recipients": [
      {
        "request_id": UUIDV4,
        "user_id": "user123",
        "email": "alice@example.com",
        "variables": { "name": "Alice", "tasks": "12" }
      },
      {
        "request_id": UUIDV4,
        "user_id": "u2",
        "email": "bob@example.com",
        "variables": { "name": "Bob", "tasks": "8" }
      }
    ],
    "webhook_url": "https://my-app.com/webhooks"
  }'`}
                </CodeBlock>
            </section>
            <DocsNavGrid
                items={[
                    { link: "/docs/getting-started", heading: "Getting Started", subtitle: "Getting started guide" },
                    { link: "/docs/configuration", heading: "Configuration", subtitle: "All environment variables explained" },
                    { link: "/docs/scaling", heading: "Scaling", subtitle: "Horizontal scaling and high throughput" },
                ]}
            />
        </div>
    );
}
