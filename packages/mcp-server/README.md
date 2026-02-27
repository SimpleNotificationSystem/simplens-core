# SimpleNS MCP Server

A Model Context Protocol (MCP) server for the SimpleNS notification engine. Allows AI assistants like Claude Desktop and Cursor to interact with your SimpleNS instance to send notifications, check analytics, and manage alerts.

## Features

- **Streamable HTTP Transport**: Local usage via npm package.
- **Stdio Transport**: Local usage via command line/npm package.

- **Tool Set**:
  - `send_notification` / `send_batch_notification` (supports templates and inline content)
  - `get_send_schema` — full schema docs with examples for AI agents
  - `list_plugins`
  - `find_failures` / `retry_failure`
  - `list_alerts` / `resolve_alert`

## Installation

No installation is required when using `npx`.

## Usage

### Streamable HTTP (Local via npm package)

Run the server locally:
```bash
npx -y @simplens/mcp
```

The server starts default at port: `3001`

Then point your MCP client at the local HTTP endpoint and pass headers on every request:

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

You can run the server locally if you have SimpleNS running locally.

Add to your MCP Client config:

```json
{
  "mcpServers": {
    "simplens-local": {
      "command": "npx",
      "args": ["-y", "@simplens/mcp", "--stdio"],
      "env": {
        "NS_API_KEY": "your-local-api-key",
        "SIMPLENS_CORE_URL": "http://localhost:3000",
        "SIMPLENS_DASHBOARD_URL": "http://localhost:3002"
      }
    }
  }
}
```

## Tools Reference

| Tool | Description |
|------|-------------|
| `send_notification` | Send a single notification via any channel (supports templates and inline content) |
| `send_batch_notification` | Send batch notifications to multiple recipients |
| `get_send_schema` | Get full request schema with examples — call before sending if unsure about format |
| `list_plugins` | List installed plugins, channels, and their schemas |
| `find_failures` | Find failed notifications with filters (channel, date, search) |
| `retry_failure` | Retry a specific failed notification by ID |
| `list_alerts` | List unresolved system alerts (ghost delivery, stuck processing) |
| `resolve_alert` | Dismiss a specific system alert |
