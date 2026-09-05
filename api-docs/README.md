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
| `NS_API_KEY` | SimpleNS API Bearer Key for authentication | `ns_...` |
| `TO_EMAIL` | Sample recipient email address | `user@example.com` |
| `TO_EMAIL_2` | Secondary recipient email address for batch requests | `user2@example.com` |
| `CHANNEL` | Notification channel identifier | `mock` |
| `PROVIDER` | Channel provider identifier | `mock` |
| `PACKAGE_NAME` | Plugin package name for templates | `simplens-plugin-mock` |
| `TEMPLATE_ID` | Identifier of a notification template | `mock-sample-1` |
| `NOTIFICATION_ID` | MongoDB ObjectId of a notification for management endpoints | `64f...` |
| `ALERT_ID` | MongoDB ObjectId of an alert for alert endpoints | `64f...` |
| `ADMIN_CHANNEL_ID` | MongoDB ObjectId of an admin alert channel | `64f...` |
| `DISCORD_WEBHOOK_URL` | Discord webhook URL for testing admin channel alerts | `https://discord.com/api/webhooks/...` |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot token for testing admin channel alerts | `123456789:ABCdefGhI...` |
| `TELEGRAM_CHAT_ID` | Telegram chat ID for testing admin channel alerts | `-1001234567890` |

---

## Collection Structure & Categories

### 1. `system` (Public)
Public server and health information (no authentication required).
- **API Root**: `GET /api` - Basic server info.
- **Health Check**: `GET /api/health` - Health status and timestamp for Docker/Kubernetes probes.

### 2. `notifications` (Protected)
Notification dispatch and status.
- **Single Request**: `POST /api/notification` - Enqueue a single notification across one or more channels.
- **Batch Request**: `POST /api/notification/batch` - Enqueue batch notifications across recipients.
- **Check Notification Endpoint**: `GET /api/notification` - Check notification service status.

### 3. `notifications_management` (Protected)
Query, inspect, retry, and delete notification records.
- **List Notifications**: `GET /api/notifications` - Paginated, sorted, and filtered notification listing.
- **Get Recent Notifications**: `GET /api/notifications/recent` - Live activity feed of latest notifications.
- **Get Notification by Id**: `GET /api/notifications/:id` - Fetch details for a specific notification.
- **Retry Notification**: `POST /api/notifications/:id/retry` - Reset a failed notification to pending for re-execution.
- **Delete Notification**: `DELETE /api/notifications/:id` - Delete a notification record.

### 4. `notification_templates` (Protected)
Manage reusable message templates for plugins.
- **Create Template**: `POST /api/templates/create` - Register a new notification template.
- **List All Templates**: `GET /api/templates` - Retrieve all templates.
- **Get Templates by Package Name**: `GET /api/templates?package_name=...` - Filter templates by plugin package.
- **Get Template by Id**: `GET /api/templates/:template_id` - Fetch single template by template ID.
- **Update Template**: `PUT /api/templates/:template_id` - Update an existing template.
- **Delete Template**: `DELETE /api/templates/:template_id` - Remove a template.

### 5. `plugins` (Protected)
Channel and provider discovery.
- **Get Plugin Metadata**: `GET /api/plugins` - List registered channels, active providers, and content/credential schemas.

### 6. `alerts` (Protected)
Manage system alerts triggered by failures or stuck workers.
- **List Alerts**: `GET /api/alerts` - List unresolved alerts with pagination and type summary counts.
- **Resolve Alert**: `POST /api/alerts/:id/resolve` - Mark alert as resolved and retry the underlying notification.
- **Bulk Resolve Alerts**: `POST /api/alerts/bulk-resolve` - Resolve multiple alerts and retry notifications in batch.
- **Dismiss Alert**: `DELETE /api/alerts/:id` - Dismiss an alert without retrying.

### 7. `dashboard` (Protected)
Analytics and trends for the admin dashboard.
- **Get Dashboard Stats**: `GET /api/dashboard/stats` - Notification counts grouped by status and channel.
- **Get Dashboard Trends**: `GET /api/dashboard/trends` - Hourly or daily time-series counts (`24h`, `7d`, `30d`).

### 8. `admin_channels` (Protected)
Manage administrator alert channels (Discord, Telegram, etc.).
- **List Admin Channel Providers**: `GET /api/admin-channels/providers` - Available provider integrations and schemas.
- **Validate Admin Channel Config**: `POST /api/admin-channels/validate` - Validate channel credentials against schema without saving.
- **Test Admin Channel Connection**: `POST /api/admin-channels/test` - Send a live test message to verify credentials.
- **List Admin Channels**: `GET /api/admin-channels` - List all configured alert channels.
- **Create Admin Channel**: `POST /api/admin-channels` - Create a new encrypted admin alert channel.
- **Get Admin Channel by Id**: `GET /api/admin-channels/:id` - Fetch single channel details.
- **Update Admin Channel**: `PATCH /api/admin-channels/:id` - Update channel name, active status, filters, or config.
- **Delete Admin Channel**: `DELETE /api/admin-channels/:id` - Remove an alert channel.