<p align="center">
    <img src="./assets/SimpleNSLogo.png" alt="SimpleNS" width="320" />
</p>

<p align="center">
  <strong>Scalable. Reliable. Extensible</strong>
</p>

<p align="center">
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="MIT License" />
  </a>
  <a href="https://github.com/sponsors">
    <img src="https://img.shields.io/badge/Open%20Source-Yes-blue.svg" alt="Open Source" />
  </a>
</p>

<h3 align="center">Open-source plugin-based notification orchestration engine for developers who value control</h3>

<p align="center">
  <a href="#key-features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#api-first-architecture--routes">API Server</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#admin-dashboard">Dashboard</a> •
  <a href="https://simplens.in">Website</a> •
  <a href="https://simplens.in/docs/core">Documentation</a>
</p>

---

**SimpleNS** is a self-hosted notification orchestration engine that manages delivery workflows—retries, scheduling, crash recovery, and scaling—while delegating the actual sending to **plugins**. Build your own providers or use community plugins to support any channel: Email, SMS, WhatsApp, Push, and beyond.

---

## Why SimpleNS?

| ❌ The Problem | ✅ How SimpleNS Solves It |
|----------------|---------------------------|
| Locked into a single notification provider | **Plugin architecture** — swap providers without code changes |
| Notifications fail silently | **Exponential backoff retries** with configurable limits |
| Crashes leave messages stuck | **Crash recovery service** detects & rescues orphaned notifications |
| Single point of failure | **Horizontally scalable** workers and processors |
| Complex scheduling logic | **Built-in scheduled delivery** with Redis-backed queues |
| Different APIs for each channel | **Unified API** for all notification channels |

---

## Key Features

- 🔌 **Plugin-Based Delivery** — Delegate sending to any provider plugin
- 🔄 **Exponential Backoff Retries** — Automatic retry with increasing delays
- 🛡️ **Crash Recovery** — Detect and rescue orphaned notifications
- ⏰ **Scheduled Delivery** — Queue notifications for future delivery
- 📈 **Horizontal Scaling** — Scale processors independently per channel
- 📡 **Multi-Channel Support** — Email, WhatsApp, SMS, Push via plugins
- 🚦 **Rate Limiting** — Per-provider token bucket algorithm
- 🔔 **Webhook Callbacks** — Real-time delivery status updates
- 📊 **Admin Dashboard** — Monitor, search, and retry notifications
- 🔔 **Admin Alert Channels** — Receive system health alerts via Discord, Telegram, and more
- 📝 **Notification Templates** — Create, edit, and manage reusable notification templates with live preview
- 🤖 **MCP Server** — Native Model Context Protocol server for AI agent integration
- 📋 **Observability** — Centralized logging with Grafana + Loki

---

## AI Agent Integration (MCP)

SimpleNS includes a native [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server (`@simplens/mcp`) that allows AI assistants like Github Copilot (VS code), Antigravity and OpenAI Codex to interact directly with your notification infrastructure.

AI agents can securely connect to your SimpleNS instance to:
- **Send Notifications** — Dispatch individual or batch notifications using templates or inline content
- **Explore Schemas** — Dynamically discover available channels, providers, and required payload fields
- **Monitor Health** — Check system alerts and investigate failed deliveries
- **Retry Failed Events** — Programmatically identify and retry failed notification events

### Running the MCP Server
Start the server without installation:
```bash
# Run in streamable-http mode
npx -y @simplens/mcp

# Run in stdio mode
npx -y @simlpens/mcp --stdio
```
*(Supports both `streamable-http` and `stdio` transports)*

---

## Architecture

![SimpleNS Architecture](./assets/SimpleNS-HLD.png)

| Component | Description |
|-----------|-------------|
| **API Server** | Central REST API engine providing ingestion, notification history, templates, alerts, metrics, and plugin schemas |
| **Background Worker** | Polls outbox, publishes to Kafka, consumes status updates |
| **Unified Processor** | Plugin-based notification delivery with rate limiting |
| **Delayed Processor** | Handles scheduled notifications via Redis ZSET queue |
| **Recovery Service** | Detects stuck notifications and reschedules them |
| **Admin Dashboard** | Decoupled Next.js client UI that interfaces exclusively through the API Server |

### Decoupled API-First Architecture

SimpleNS is built around a strictly **decoupled, API-first model**:

- **Self-Sufficient API Server**: The API Server is the single source of truth for all notification operations, database persistence (MongoDB), outbox streaming (Kafka), analytics, and plugin metadata. It can run 100% headless in production without the dashboard.
- **Thin Dashboard Client**: The Next.js Admin Dashboard **holds no backend business logic or direct database connections**. Every user action—querying events, editing templates, resolving alerts, and configuring channels—is dispatched directly to the API Server via standard REST endpoints.
- **Client Agnostic**: Because all capabilities are exposed via the API Server, you can drive SimpleNS through the official dashboard, your own custom internal tools, automation scripts (via our [Bruno API Collection](./api-docs)), or AI agents (via the native MCP server).

### Plugin System

SimpleNS Core handles **orchestration**; plugins handle **delivery**.

Plugins are automatically installed at runtime based on your `simplens.config.yaml` configuration. Use the **Config Generator CLI** to create or update your config:

```bash
# Generate config for a plugin
npx @simplens/config-gen generate @simplens/mock

# Generate config for multiple plugins
npx @simplens/config-gen gen @simplens/nodemailer-gmail @simplens/twilio-sms

# Add a plugin to existing config
npx @simplens/config-gen gen @simplens/nodemailer-gmail -c simplens.config.yaml

# List available official plugins
npx @simplens/config-gen list --offical

#List available community plugins
npx @simplens/config-gen list --community
```

#### Building Custom Plugins

The `@simplens/create-simplens-plugin` CLI scaffolds a plugin project:

```bash
npx @simplens/create-simplens-plugin
```

This generates the boilerplate so you only write the delivery logic:

```typescript
import { SimpleNSProvider, ProviderManifest } from '@simplens/sdk';

class MyProvider implements SimpleNSProvider {
  readonly manifest: ProviderManifest = {
    name: 'my-provider',
    channel: 'email',
    requiredCredentials: ['API_KEY'],
    // ...
  };
  
  async send(notification) {
    // Your delivery logic
    return { success: true, messageId: 'msg-123' };
  }
}
```

---

## Quick Start

### Prerequisites

- **Docker** and **Docker Compose**

### Installation

Get SimpleNS running in under a minute with a single command:

**Linux:**
```bash
curl -fsSL https://simplens.in/api/install/linux | bash
```

**Windows (PowerShell as Administrator):**
```powershell
irm https://simplens.in/api/install/windows | iex
```

**npm:**
```bash
npx @simplens/onboard
```

The installer will automatically pull Docker images, configure your environment, set up plugin configuration, and start all services.

### Verify Installation

```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Send Your First Notification

**Using the Dashboard (recommended):**

1. Open [http://localhost:3002](http://localhost:3002)
2. Login with your configured credentials (default: `admin` / `<your-password-from-env>`)
3. Navigate to **Send**, select a channel/provider, fill in the fields, and click **Send Notification**

**Using cURL:**

```bash
curl -X POST http://localhost:3000/api/notification \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR-NS-API-KEY>" \
  -d '{
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "client_id": "55283667-1f58-467d-86a1-47f7f0e059f2",
    "channel": ["mock"],
    "recipient": {
      "user_id": "user123"
    },
    "content": {
      "mock": {
        "message": "Hello from SimpleNS!"
      }
    }
  }'
```

> **Tip:** Each provider's recipient and content schemas can vary. Use the **Payload Studio** in the admin dashboard to get the exact schema.

### Check Notification Status

1. Go to **Events** page in the dashboard
2. Search for your notification by ID
3. Check status: `pending` → `processing` → `delivered`

### Accessing Services

| Service | URL | Description |
|---------|-----|-------------|
| API Server | [http://localhost:3000](http://localhost:3000) | Notification API |
| Admin Dashboard | [http://localhost:3002](http://localhost:3002) | Monitoring & management |
| Grafana | [http://localhost:3001](http://localhost:3001) | Log visualization |
| Kafka UI | [http://localhost:8080](http://localhost:8080) | Kafka topic monitoring |

### Add More Plugins

```bash
# Add Gmail email provider
npx @simplens/config-gen generate @simplens/nodemailer-gmail -c simplens.config.yaml

# List available plugins
npx @simplens/config-gen list --official
```

> For production deployments, see the [Self-Hosting Guide](https://simplens.in/docs/core/self-hosting) which covers distributed deployments, cloud infrastructure integration, and security hardening.

---

## API-First Architecture & Routes

SimpleNS provides a comprehensive, authenticated REST API that powers both external clients and the Admin Dashboard. Because the core engine is decoupled from the UI, every action possible in the dashboard can be automated or integrated via REST endpoints.

| Category | Route | Method | Description |
|---|---|---|---|
| **System** | `/api` | `GET` | API Server status |
| | `/api/health` | `GET` | Health check probe (Docker / K8s) |
| **Notifications** | `/api/notification` | `POST` | Dispatch single notification |
| | `/api/notification/batch` | `POST` | Dispatch batch notification |
| | `/api/notification` | `GET` | Notification endpoint health |
| **Management** | `/api/notifications` | `GET` | Search & filter notification history |
| | `/api/notifications/recent` | `GET` | Activity feed of latest notifications |
| | `/api/notifications/:id` | `GET` | Fetch single notification details |
| | `/api/notifications/:id/retry` | `POST` | Reset failed notification for retry |
| | `/api/notifications/:id` | `DELETE` | Delete notification record |
| **Templates** | `/api/templates/create` | `POST` | Create reusable notification template |
| | `/api/templates` | `GET` | List all templates (or filter by package) |
| | `/api/templates/:template_id` | `GET` | Fetch template by ID |
| | `/api/templates/:template_id` | `PUT` | Update notification template |
| | `/api/templates/:template_id` | `DELETE` | Delete notification template |
| **Plugins** | `/api/plugins` | `GET` | Dynamic plugin metadata & schemas |
| **Alerts** | `/api/alerts` | `GET` | List system alerts |
| | `/api/alerts/:id/resolve` | `POST` | Resolve alert and retry notification |
| | `/api/alerts/bulk-resolve` | `POST` | Bulk resolve alerts and retry |
| | `/api/alerts/:id` | `DELETE` | Dismiss alert without retrying |
| **Dashboard** | `/api/dashboard/stats` | `GET` | Notification counts by status & channel |
| | `/api/dashboard/trends` | `GET` | Historical time-series trend data |
| **Admin Channels** | `/api/admin-channels/providers` | `GET` | Available alerting channel providers |
| | `/api/admin-channels/validate` | `POST` | Validate channel configuration schema |
| | `/api/admin-channels/test` | `POST` | Test live webhook or bot connection |
| | `/api/admin-channels` | `GET` / `POST` | List or create admin alert channels |
| | `/api/admin-channels/:id` | `GET` / `PATCH` / `DELETE` | Manage individual admin alert channels |

> 📖 **Interactive API Collection**: A complete [Bruno](https://www.usebruno.com/) collection is available in [`/api-docs`](./api-docs) with preconfigured environments and sample requests for all endpoints.

---

## Admin Dashboard

![Admin Dashboard](./assets/DashboardUI.png)

The Admin Dashboard is an independent Next.js application built strictly as a **thin presentation client**:

- 💡 **Zero Backend Implementations**: The dashboard contains no database access, worker logic, or business rules. It depends entirely on the SimpleNS Core API Server.
- 🔌 **API Driven**: Every action—from rendering stats to triggering retries and saving templates—dispatches directly to the REST API routes.
- 🏢 **Headless Ready**: Because the dashboard is fully decoupled, you can operate SimpleNS headless in backend environments, deploy custom frontends, or interact via CI/CD and AI tools without running the dashboard.

**Key Dashboard Features:**
- 🏠 **Dashboard Home** — Status overview powered by `/api/dashboard/stats`
- 📡 **Channel Cards** — Visual status for each configured delivery channel
- 📋 **Events Explorer** — Paginated event table with live filtering via `/api/notifications`
- 🔴 **Failed Events** — Dedicated view with one-click retries via `/api/notifications/:id/retry`
- 🚨 **Alerts** — System health and orphaned recovery alerts via `/api/alerts`
- 📈 **Analytics** — 24h, 7d, and 30d time-series trends via `/api/dashboard/trends`
- 🔌 **Plugins** — Dynamic form generation based on runtime schemas from `/api/plugins`
- 🔧 **Payload Studio** — Interactive schema explorer for constructing valid payloads
- 🔔 **Admin Alert Channels** — Live test and configure Discord/Telegram alerts via `/api/admin-channels`
- 📝 **Notification Templates** — Full lifecycle management and live preview via `/api/templates`

---

## License

MIT License — see [LICENSE](./LICENSE) for details.

---

<p align="center">
  <sub>Built with ❤️ for developers who need reliable notifications</sub>
</p>
