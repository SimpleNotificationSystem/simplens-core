# SimpleNS MCP Server

A Model Context Protocol (MCP) server for the SimpleNS notification orchestration engine (`@simplens/mcp`). Enables AI assistants like Claude Desktop, Cursor, and custom MCP clients to send notifications, manage templates, query delivery logs, resolve alerts, inspect analytics, and configure channel providers.

---

## Features

- **Streamable HTTP Transport**: Connect remote or local MCP clients via HTTP (`/mcp`).
- **Stdio Transport**: Local execution via command line (`--stdio`).
- **Full Tool Suite (54 Tools)**: Comprehensive coverage for notifications, templates, alerts, logs, metrics, channel routing, providers, rate limits, dynamic settings, plugin lifecycle, and admin configuration.

---

## Installation & Usage

No pre-installation is required when using `npx`.

### Streamable HTTP (Local via npm package)

Run the server locally:

```bash
npx -y @simplens/mcp
```

The server starts by default on port `3001`.

Configure your MCP client:

```json
{
  "mcpServers": {
    "simplens-local-http": {
      "type": "streamable-http",
      "url": "http://localhost:3001/mcp",
      "headers": {
        "X-SimpleNS-API-Key": "your-ns-api-key",
        "X-SimpleNS-Core-URL": "http://localhost:3000"
      }
    }
  }
}
```

> [!NOTE]
> **Version 1.1 Update**: The Dashboard URL (`X-SimpleNS-Dashboard-URL` header / `SIMPLENS_DASHBOARD_URL` environment variable) is no longer required. All tools (including alerts, failure queries, and retries) now route directly to the core Express API service. *Note: Versions below 1.1 still require the dashboard URL to be provided.*

> Sample Config for versions < `1.1`

```json
{
  "mcpServers": {
    "simplens-local-http": {
      "type": "streamable-http",
      "url": "http://localhost:3001/mcp",
      "headers": {
        "X-SimpleNS-API-Key": "your-ns-api-key",
        "X-SimpleNS-Core-URL": "http://localhost:3000",
        "X-SimpleNS-Dashboard-URL": "http://localhost:3002"
      }
    }
  }
}
```

### Stdio (Local via npm package)

Run the MCP server in stdio mode alongside a running SimpleNS backend:

Add to your MCP Client configuration:

```json
{
  "mcpServers": {
    "simplens-local": {
      "command": "npx",
      "args": ["-y", "@simplens/mcp", "--stdio"],
      "env": {
        "NS_API_KEY": "your-local-api-key",
        "SIMPLENS_CORE_URL": "http://localhost:3000"
      }
    }
  }
}
```

---

## Complete Tools Reference (54 Tools)

### 1. Notification Dispatch
| Tool | Description |
| :--- | :--- |
| `send_notification` | Send a single notification via any installed channel (Email, Slack, SMS, Webhook, etc.) with inline content or template references. |
| `send_batch_notification` | Dispatch bulk notifications to multiple recipients or channels simultaneously. |

### 2. Plugin & Schema Discovery
| Tool | Description |
| :--- | :--- |
| `list_plugins` | List all active notification channel plugins installed on the SimpleNS core instance. |
| `get_send_schema` | Retrieve payload JSON schemas, required fields, and credential specifications for any channel plugin. |

### 3. Template Management
| Tool | Description |
| :--- | :--- |
| `create_template` | Create a new reusable notification template with subject and body placeholders. |
| `list_templates` | Query and list existing notification templates with pagination. |
| `get_template_by_id` | Fetch full details, metadata, and body content of a specific template. |
| `update_template` | Modify an existing notification template by ID. |
| `delete_template` | Delete a notification template from the system. |

### 4. Notification History & Logs
| Tool | Description |
| :--- | :--- |
| `list_notifications` | Query historical notification delivery logs with filtering by channel, status, recipient, or date. |
| `get_recent_notifications` | Fetch a quick snapshot of the most recent notification dispatches. |
| `get_notification_by_id` | Inspect execution details, logs, and status of a specific notification. |
| `delete_notification` | Delete a notification record from history. |

### 5. Alerts, Failures & DLQ Management
| Tool | Description |
| :--- | :--- |
| `list_alerts` | List active delivery failure alerts and dead-letter queue (DLQ) entries. |
| `delete_alert` | Dismiss or delete a specific delivery failure alert. |
| `find_failures` | Search delivery failure logs by channel, error code/message, or timeframe. |
| `retry_failure` | Manually re-queue and retry a failed notification dispatch by ID. |
| `resolve_alert_with_retry` | Resolve a failure alert and trigger an immediate notification retry. |
| `bulk_resolve_alerts` | Bulk resolve multiple delivery alerts with optional bulk retries. |

### 6. Dashboard Analytics & Metrics
| Tool | Description |
| :--- | :--- |
| `get_dashboard_stats` | Get high-level system analytics (total sent, success rate, failure rate, active channels). |
| `get_dashboard_trends` | Retrieve notification volume, error rate, and delivery latency trends over time. |

### 7. Admin Channels & Configuration
| Tool | Description |
| :--- | :--- |
| `list_admin_channel_providers` | List available channel providers (SMTP, SendGrid, Twilio, Slack Webhook, Telegram, etc.). |
| `list_admin_channels` | List all configured admin notification channels. |
| `get_admin_channel` | Retrieve configuration details and settings for a specific admin channel. |
| `create_admin_channel` | Configure and save a new admin notification channel. |
| `update_admin_channel` | Modify settings or credentials for an existing admin channel. |
| `delete_admin_channel` | Delete an admin channel configuration. |
| `test_admin_channel` | Execute a live connection and credential test for an admin channel. |
| `validate_admin_channel_config` | Validate configuration parameters against provider requirements before saving. |

### 8. Channel Routing & Kafka Partition Scaling
| Tool | Description |
| :--- | :--- |
| `list_channel_routings` | List all configured channel routings showing default provider, fallback cascade, and partition counts. |
| `get_channel_routing` | Retrieve routing configuration and fallback chain for a specific channel (e.g. email, sms). |
| `set_channel_routing` | Configure default provider, ordered cascading fallback providers, and Kafka partitions for a channel. |
| `delete_channel_routing` | Remove routing rules for a channel. |

### 9. Provider Management & Real-Time Rate Limiting
| Tool | Description |
| :--- | :--- |
| `list_providers` | List all configured provider instances with their enabled status and options. |
| `get_provider` | Retrieve detailed configuration and status for a single provider instance (supports optional decrypted view). |
| `create_provider` | Instantiate and register a new provider instance with credentials and rate limit options. |
| `update_provider` | Update credentials, options, or toggle enabled state of an existing provider. |
| `delete_provider` | Remove a provider instance (verifies no active channel routings depend on it). |
| `test_provider` | Test connection and credentials for an existing provider or unpersisted configuration. |
| `get_providers_rate_limits` | Real-time token bucket capacity, refill rates, and metrics across all providers. |
| `get_provider_rate_limit` | Real-time rate limit status and remaining token capacity for a specific provider instance. |
| `reset_provider_rate_limit` | Manually reset rate limiter tokens and telemetry counters for a specific provider in Redis. |

### 10. Dynamic Operational Settings
| Tool | Description |
| :--- | :--- |
| `get_operational_settings` | Retrieve active operational settings (worker concurrency, retry limits, polling intervals, DLQ thresholds). |
| `update_operational_settings` | Hot-update operational settings cluster-wide via Redis pub/sub with zero service restarts. |
| `reset_operational_settings` | Reset all dynamic operational configuration parameters to system defaults. |

### 11. Plugin Lifecycle & NPM Registry Management
| Tool | Description |
| :--- | :--- |
| `list_installed_plugins` | List all installed npm plugin packages stored in MongoDB with version and installation timestamp. |
| `get_plugin_catalog` | Browse available plugins from the public catalog by category (`official` or `community`). |
| `install_plugin` | Download, validate, and hot-load an npm provider plugin package with optional private auth. |
| `change_plugin_version` | Upgrade or downgrade an installed plugin to a specified semver version. |
| `uninstall_plugin` | Uninstall an installed plugin package and clean up associated resources. |
| `get_npm_auth` | Check configured npm registry authentication status and masked tokens. |
| `save_npm_auth` | Save private npm registry credentials (auth token, registry URL, optional scope). |
| `delete_npm_auth` | Remove saved npm registry authentication credentials. |

### 12. Admin Setup Status
| Tool | Description |
| :--- | :--- |
| `get_admin_auth_status` | Check whether SimpleNS administrator credentials have been configured or require initial setup. |

