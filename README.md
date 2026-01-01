<p align="center">
    <img src="./assets/SimpleNSLogo.png" alt="SimpleNS" width="320" />
</p>

<h3 align="center">Open-source plugin-based notification orchestration engine for developers who value control</h3>

<p align="center">
  <strong>Scalable • Reliable • Extensible</strong>
</p>

<p align="center">
  <a href="#key-features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#admin-dashboard">Dashboard</a> •
  <a href="https://simplens.vercel.app">Website</a> •
  <a href="https://simplens.vercel.app/docs/core">Documentation</a>
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

- Docker & Docker Compose

### 1. Create Project Directory

```bash
mkdir my-simplens && cd my-simplens
```

### 2. Configure the .env file

- Copy the `.env.example` file into `.env` in your `my-simplens` dir and configure the required fields 


### 3. Generate Plugin Configuration

Use the config generator CLI to create `simplens.config.yaml`:

```bash
# Generate config for the mock plugin (for testing)
npx @simplens/config-gen generate @simplens/mock

# Or generate config for email
npx @simplens/config-gen generate @simplens/nodemailer-gmail

```

The generated config includes comments explaining each field. Set the corresponding environment variables in `.env`.

### 4. Copy Docker-Compose files
 - Copy `docker-compose.yaml` (for appliciation services) and `docker-compose.infra.yaml` file (for infrastrucutre services if you dont want to use cloud providers for infrastrucutre)


> **Note:** You'll also need MongoDB, Redis, and Kafka. See the [full documentation](https://simplens.vercel.app/docs/core/self-hosting) for infrastructure setup.

### 5. Start Services

```bash
docker-compose -f docker-compose.infra.yaml up -d #If you don't want to use cloud providers for infrastructure
docker-compose up -d
```

Plugins listed in `simplens.config.yaml` are automatically installed at container startup.

### 6. Send a Notification

The request schema can be easily obtained from the `Payload Studio` in the admin dashboard.

```bash
curl -X POST http://localhost:3000/api/notification \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_NS_API_KEY" \
  -d '{
    "request_id": "<UUIDV4>",
    "client_id": "<UUIDV4>",
    "channel": ["email"],
    "recipient": {
      "user_id": "<string>",
      "email": "<valid email>"
    },
    "content": {
      "email": {
        "subject": "Hello from SimpleNS!",
        "message": "<h1>Welcome!</h1><p>Your notification system is working.</p>"
      }
    }
  }'
```

### 7. Check the Dashboard

Open [http://localhost:3002](http://localhost:3002) and login with your configured credentials:
- **Username:** `admin` (default, configurable via `ADMIN_USERNAME`)
- **Password:** `admin` (default, configurable via `ADMIN_PASSWORD`)

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
