# SimpleNS API Documentation (Bruno Collection)

This directory contains the official [Bruno](https://www.usebruno.com/) API collection for all routes exposed by SimpleNS Core.

## Quickstart

1. **Install Bruno Desktop App**: Ensure you have `Bruno Desktop App` version `>= 3.1.3`.
2. **Open Collection**: Open this directory (`api-docs`) in Bruno (`Open Collection` -> select `api-docs` folder).
3. **Configure Environment Variables**:
   - Copy `.env.example` into `.env`:
     ```bash
     cd api-docs
     cp .env.example .env
     ```
   - Populate the variables in `.env` (or configure them in Bruno's environment settings).
   - In Bruno Desktop App, ensure the `.env` file is loaded for the collection so variables are resolved via `{{process.env.VAR_NAME}}`.

Refer to the [Bruno Secrets Management & DotEnv Documentation](https://docs.usebruno.com/secrets-management/dotenv-file#manage-environment-credentials) for more details.

---

## Environment Variables

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `BASE_URL` | Base HTTP URL of the SimpleNS API server | `http://localhost:3000` |
| `API_KEY` | SimpleNS API Bearer Key for authentication | `sns_...` |
| `API_KEY_ID` | MongoDB ObjectId or key_id of an API key | `64f...` |
| `TO_EMAIL` | Sample recipient email address | `user@example.com` |
| `TO_EMAIL_2` | Secondary recipient email address for batch requests | `user2@example.com` |
| `CHANNEL` | Notification channel identifier | `mock` |
| `PROVIDER` | Channel provider identifier | `mock` |
| `PACKAGE_NAME` | Plugin package name for templates and plugins | `simplens-plugin-mock` |
| `TEMPLATE_ID` | Identifier of a notification template | `mock-sample-1` |
| `NOTIFICATION_ID` | MongoDB ObjectId of a notification for management endpoints | `64f...` |
| `ALERT_ID` | MongoDB ObjectId of an alert for alert endpoints | `64f...` |
| `ADMIN_CHANNEL_ID` | MongoDB ObjectId of an admin alert channel | `64f...` |
| `DISCORD_WEBHOOK_URL` | Discord webhook URL for testing admin channel alerts | `https://discord.com/api/webhooks/...` |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot token for testing admin channel alerts | `123456789:ABCdefGhI...` |
| `TELEGRAM_CHAT_ID` | Telegram chat ID for testing admin channel alerts | `-1001234567890` |
| `ADMIN_USERNAME` | Administrator username for initial setup & verification | `admin` |
| `ADMIN_PASSWORD` | Administrator password for initial setup & verification | `SecureAdminPassword123!` |
| `PROVIDER_ID` | Identifier for configured provider instance | `mock-provider-1` |
| `ROUTING_CHANNEL` | Notification channel identifier for routing config | `mock` |
| `NPM_AUTH_TOKEN` | Private npm registry authentication token | `npm_...` |
| `NPM_REGISTRY_URL` | Custom or default npm registry URL | `https://registry.npmjs.org/` |

---

## Authentication & Authorization

SimpleNS supports dual authentication across all protected API routes:

1. **Admin Dashboard (Browser Cookie)**:
   - Authenticated using the HTTP-only `simplens_session` cookie.
   - Automatically set by the Core API when calling `POST /api/admin/auth/signup` or `POST /api/admin/auth/login`.
   - Cleared on `POST /api/admin/auth/logout`.
   - Browsers automatically attach this cookie on every request without requiring client-side token storage.

2. **Programmatic API Clients & Services (API Key or Bearer Token)**:
   - Authenticated using dynamic API keys (`sns_live_...` or `sns_test_...`) created via the Dashboard or API.
   - Passed via either header:
     - `Authorization: Bearer <API_KEY>`
     - `x-api-key: <API_KEY>`

All protected routes in SimpleNS accept either authentication method interchangeably.

---

## Collection Structure & Categories

### 1. `system` (Public)
Public server and health information (no authentication required).
- **API Root**: `GET /api` - Basic server info.
- **Health Check**: `GET /api/health` - Health status and timestamp for Docker/Kubernetes probes.

### 2. `admin_auth` (Public)
Administrator setup, authentication, and session management.
- **Check Admin Auth Status**: `GET /api/admin/auth/status` - Check whether an administrator account has already been configured.
- **Signup Admin Account**: `POST /api/admin/auth/signup` - Configure the primary administrator account (only allowed once during setup). Sets `simplens_session` cookie.
  ```json
  {
    "username": "{{process.env.ADMIN_USERNAME}}",
    "password": "{{process.env.ADMIN_PASSWORD}}"
  }
  ```
- **Login Admin Account**: `POST /api/admin/auth/login` - Verify administrator credentials and set the `simplens_session` HTTP-only cookie.
  ```json
  {
    "username": "{{process.env.ADMIN_USERNAME}}",
    "password": "{{process.env.ADMIN_PASSWORD}}"
  }
  ```
- **Logout Admin Account**: `POST /api/admin/auth/logout` - Clear and invalidate the `simplens_session` cookie.

### 3. `notifications` (Protected)
Notification dispatch and status.
- **Single Request**: `POST /api/notification` - Enqueue a single notification across one or more channels.
- **Batch Request**: `POST /api/notification/batch` - Enqueue batch notifications across recipients.
- **Check Notification Endpoint**: `GET /api/notification` - Check notification service status.

### 4. `notifications_management` (Protected)
Query, inspect, retry, and delete notification records.
- **List Notifications**: `GET /api/notifications` - Paginated, sorted, and filtered notification listing.
- **Get Recent Notifications**: `GET /api/notifications/recent` - Live activity feed of latest notifications.
- **Get Notification by Id**: `GET /api/notifications/:id` - Fetch details for a specific notification.
- **Retry Notification**: `POST /api/notifications/:id/retry` - Reset a failed notification to pending for re-execution.
- **Delete Notification**: `DELETE /api/notifications/:id` - Delete a notification record.

### 5. `notification_templates` (Protected)
Manage reusable message templates for plugins.
- **Create Template**: `POST /api/templates/create` - Register a new notification template.
- **List All Templates**: `GET /api/templates` - Retrieve all templates.
- **Get Templates by Package Name**: `GET /api/templates?package_name=...` - Filter templates by plugin package.
- **Get Template by Id**: `GET /api/templates/:template_id` - Fetch single template by template ID.
- **Update Template**: `PUT /api/templates/:template_id` - Update an existing template.
- **Delete Template**: `DELETE /api/templates/:template_id` - Remove a template.

### 6. `plugins` (Protected)
Channel discovery, installed npm plugins, public plugin catalog, npm registry authentication, and plugin lifecycle.
- **Get Plugin Metadata**: `GET /api/plugins` - List registered channels, active providers, and content/credential schemas.
- **List Installed Plugins**: `GET /api/plugins/installed` - List all installed npm plugins in MongoDB.
- **List Plugin Catalog**: `GET /api/plugins/catalog/:category` - Fetch official or community plugin catalog (`official` | `community`).
- **Get npm Auth Status**: `GET /api/plugins/npm-auth` - Retrieve npm authentication status with masked tokens.
- **Save npm Auth Config**: `POST /api/plugins/npm-auth` - Save custom npm token and registry configuration.
  ```json
  {
    "token": "{{process.env.NPM_AUTH_TOKEN}}",
    "registry_url": "{{process.env.NPM_REGISTRY_URL}}"
  }
  ```
- **Delete npm Auth Config**: `DELETE /api/plugins/npm-auth` - Remove configured npm registry credentials.
- **Install Plugin**: `POST /api/plugins/install` - Download, verify, and register an npm plugin package.
  ```json
  {
    "package": "{{process.env.PACKAGE_NAME}}",
    "version": "latest",
    "auth": {
      "token": "{{process.env.NPM_AUTH_TOKEN}}",
      "registry_url": "{{process.env.NPM_REGISTRY_URL}}",
      "save_token": true
    }
  }
  ```
- **Change Plugin Version**: `PUT /api/plugins/version` - Upgrade or downgrade an installed plugin version.
  ```json
  {
    "package": "{{process.env.PACKAGE_NAME}}",
    "version": "1.0.1"
  }
  ```
- **Uninstall Plugin**: `DELETE /api/plugins/:package` - Uninstall and clean up a plugin package.

### 7. `providers` (Protected)
Manage provider instances, test connections, and inspect/reset token-bucket rate limits.
- **List Providers**: `GET /api/providers` - Retrieve all configured provider instances.
- **Create Provider**: `POST /api/providers` - Register a new provider with encrypted credentials and rate limiting options.
  ```json
  {
    "id": "{{process.env.PROVIDER_ID}}",
    "plugin_name": "{{process.env.PACKAGE_NAME}}",
    "credentials": {
      "apiKey": "sample-provider-api-key"
    },
    "options": {
      "priority": 1,
      "rateLimit": {
        "maxTokens": 100,
        "refillRate": 10,
        "refillInterval": "second"
      }
    },
    "enabled": true
  }
  ```
- **Get Provider by Id**: `GET /api/providers/:id` - Fetch provider by ID (with optional `include_decrypted=true/false`).
- **Update Provider**: `PUT /api/providers/:id` - Update provider credentials, priority, or rate limits.
- **Delete Provider**: `DELETE /api/providers/:id` - Remove a provider instance.
- **Test Provider Connection**: `POST /api/providers/test` - Test provider connectivity without persisting credentials.
- **Get Providers Rate Limits**: `GET /api/providers/rate-limits` - Real-time rate limiter status across all providers.
- **Get Provider Rate Limit**: `GET /api/providers/:id/rate-limit` - Real-time rate limiter tokens and telemetry for a specific provider.
- **Reset Provider Rate Limit**: `POST /api/providers/:id/rate-limit/reset` - Manually refill tokens and clear rate limiter backoffs.

### 8. `channel_routing` (Protected)
Configure default providers, fallback provider chains, and Kafka partition count per notification channel.
- **List Channel Routings**: `GET /api/channels/routing` - List all channel routing configurations.
- **Get Channel Routing**: `GET /api/channels/routing/:channel` - Retrieve routing for a specific channel (e.g. `email`, `mock`).
- **Set Channel Routing**: `PUT /api/channels/routing/:channel` - Configure default provider, cascading fallback array, and partitions.
  ```json
  {
    "default_provider_id": "{{process.env.PROVIDER_ID}}",
    "fallback_provider_ids": [],
    "partitions": 6
  }
  ```
- **Delete Channel Routing**: `DELETE /api/channels/routing/:channel` - Remove routing configuration for a channel.

### 9. `alerts` (Protected)
Manage system alerts triggered by failures or stuck workers.
- **List Alerts**: `GET /api/alerts` - List unresolved alerts with pagination and type summary counts.
- **Resolve Alert**: `POST /api/alerts/:id/resolve` - Mark alert as resolved and retry the underlying notification.
- **Bulk Resolve Alerts**: `POST /api/alerts/bulk-resolve` - Resolve multiple alerts and retry notifications in batch.
- **Dismiss Alert**: `DELETE /api/alerts/:id` - Dismiss an alert without retrying.

### 10. `dashboard` (Protected)
Analytics and trends for the admin dashboard.
- **Get Dashboard Stats**: `GET /api/dashboard/stats` - Notification counts grouped by status and channel.
- **Get Dashboard Trends**: `GET /api/dashboard/trends` - Hourly or daily time-series counts (`24h`, `7d`, `30d`).

### 11. `admin_channels` (Protected)
Manage administrator alert channels (Discord, Telegram, etc.).
- **List Admin Channel Providers**: `GET /api/admin-channels/providers` - Available provider integrations and schemas.
- **Validate Admin Channel Config**: `POST /api/admin-channels/validate` - Validate channel credentials against schema without saving.
- **Test Admin Channel Connection**: `POST /api/admin-channels/test` - Send a live test message to verify credentials.
- **List Admin Channels**: `GET /api/admin-channels` - List all configured alert channels.
- **Create Admin Channel**: `POST /api/admin-channels` - Create a new encrypted admin alert channel.
- **Get Admin Channel by Id**: `GET /api/admin-channels/:id` - Fetch single channel details.
- **Update Admin Channel**: `PATCH /api/admin-channels/:id` - Update channel name, active status, filters, or config.
- **Delete Admin Channel**: `DELETE /api/admin-channels/:id` - Remove an alert channel.

### 12. `settings` (Protected)
Read, modify, and reset live operational configuration across services via Redis sync.
- **Get Operational Settings**: `GET /api/settings` - Retrieve current active settings for API, workers, retry, delayed poller, recovery, and logging.
- **Update Operational Settings**: `PUT /api/settings` - Update one or more configuration fields.
  ```json
  {
    "api": {
      "max_batch_req_limit": 1000
    },
    "worker": {
      "outbox_poll_interval_ms": 5000,
      "outbox_cleanup_interval_ms": 60000,
      "outbox_batch_size": 100,
      "outbox_retention_ms": 300000,
      "outbox_claim_timeout_ms": 30000
    },
    "retry": {
      "max_retry_count": 5,
      "idempotency_ttl_seconds": 86400,
      "processing_ttl_seconds": 120,
      "rate_limit_retry_delay_ms": 5000
    },
    "delayed": {
      "delayed_poll_interval_ms": 1000,
      "delayed_batch_size": 10,
      "max_poller_retries": 3
    },
    "recovery": {
      "recovery_poll_interval_ms": 60000,
      "processing_stuck_threshold_ms": 300000,
      "pending_stuck_threshold_ms": 300000,
      "recovery_batch_size": 50,
      "recovery_claim_timeout_ms": 60000,
      "cleanup_resolved_alerts_retention_ms": 86400000,
      "cleanup_processed_status_outbox_retention_ms": 86400000
    },
    "logging": {
      "log_level": "info",
      "log_to_file": true
    }
  }
  ```
- **Reset Operational Settings**: `POST /api/settings/reset` - Reset operational settings to system defaults and broadcast to all services.

### 13. `api_keys` (Protected)
Create, manage, inspect, and revoke programmatic API keys.
- **List API Keys**: `GET /api/keys` - List all active and revoked API keys.
- **Create API Key**: `POST /api/keys` - Generate a new scoped API key (`sns_live_...` or `sns_test_...`).
  ```json
  {
    "name": "Integration Service Key",
    "type": "live",
    "scopes": ["*"]
  }
  ```
- **Get API Key Usage**: `GET /api/keys/:id` - Inspect key metadata, usage counters, and last used timestamp.
- **Revoke API Key**: `POST /api/keys/:id/revoke` - Immediately deactivate an active API key.
- **Delete API Key**: `DELETE /api/keys/:id` - Permanently remove an API key record.