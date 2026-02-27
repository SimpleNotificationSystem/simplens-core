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
  <a href="http://makeapullrequest.com">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome" />
  </a>
</p>

<h3 align="center">Open-source plugin-based notification orchestration engine for developers who value control</h3>

<p align="center">
  <a href="#key-features">Features</a> •
  <a href="#architecture">Architecture</a> •
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
- 📋 **Observability** — Centralized logging with Grafana + Loki

---

## Architecture

![SimpleNS Architecture](./assets/SimpleNS-HLD.png)

| Component | Description |
|-----------|-------------|
| **API Server** | REST API for notification ingestion (`/api/notification`, `/api/notification/batch`) |
| **Background Worker** | Polls outbox, publishes to Kafka, consumes status updates |
| **Unified Processor** | Plugin-based notification delivery with rate limiting |
| **Delayed Processor** | Handles scheduled notifications via Redis ZSET queue |
| **Recovery Service** | Detects stuck notifications and reschedules them |

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
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
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

## Admin Dashboard

![Admin Dashboard](./assets/DashboardUI.png)

The Admin Dashboard provides a modern interface for monitoring and managing notifications:

- 🏠 **Dashboard Home** — Overview with status cards showing total, delivered, pending, and failed counts
- 📡 **Channel Cards** — Visual cards for each configured channel (Email, WhatsApp, etc.) with quick navigation
- 📋 **Events Explorer** — Paginated event table with filtering, search, and status indicators
- 🔴 **Failed Events** — Dedicated view for failed notifications with retry capabilities
- 🚨 **Alerts** — System alerts for orphaned notifications and recovery events requiring attention
- 📈 **Analytics** — Charts and visualizations for notification status and channel distribution
- 🔌 **Plugins** — View installed plugins, their channels, and provider configurations
- 🔧 **Payload Studio** — Interactive schema explorer for building and notification payloads

---

## License

MIT License — see [LICENSE](./LICENSE) for details.

---

<p align="center">
  <sub>Built with ❤️ for developers who need reliable notifications</sub>
</p>
