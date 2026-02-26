# SimpleNS MCP Server

A Model Context Protocol (MCP) server for the SimpleNS notification engine. Allows AI assistants like Claude Desktop and Cursor to interact with your SimpleNS instance to send notifications, check analytics, and manage alerts.

## Features

- **Streamable HTTP Transport**: Hostable at `mcp.simplens.in` for remote access.
- **Stdio Transport**: Local usage via command line.
- **Stateless Authentication**: Credentials passed via HTTP headers per-request (no server-side session storage/state).
- **Tool Set**:
  - `send_notification` / `send_batch_notification`
  - `list_plugins`
  - `find_failures` / `retry_failure`
  - `list_alerts` / `resolve_alert`
- **Resources**:
  - `simplens://schema/notification`
  - `simplens://schema/batch`

## Installation

```bash
npm install
npm run build
```

## Usage

### Remote (Hosted) Mode

Start the server:
```bash
npm start
# Server listens on port 3001
```

Configure your MCP Client (e.g. Claude Desktop) to connect via HTTP:

```json
{
  "mcpServers": {
    "simplens": {
      "type": "streamable-http",
      "url": "https://your-mcp-server-url.com/mcp",
      "headers": {
        "X-SimpleNS-API-Key": "your-ns-api-key",
        "X-SimpleNS-Core-URL": "https://your-simplens-core.com",
        "X-SimpleNS-Dashboard-URL": "https://your-simplens-dashboard.com"
      }
    }
  }
}
```

### Streamable HTTP (Local Command)

Run the server locally:
```bash
npx @simplens/mcp
# or: npm start
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

### Local (Stdio) Mode

You can run the server locally if you have SimpleNS running locally.

Add to your MCP Client config:

```json
{
  "mcpServers": {
    "simplens-local": {
      "command": "npx",
      "args": ["@simplens/mcp", "--stdio"],
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
| `send_notification` | Send a single notification via any channel |
| `send_batch_notification` | Send batch notifications |
| `list_plugins` | List installed plugins, channels, and their schemas |
| `find_failures` | Find failed notifications with filters (channel, date, search) |
| `retry_failure` | Retry a specific failed notification by ID |
| `list_alerts` | List unresolved system alerts (ghost delivery, stuck processing) |
| `resolve_alert` | Dismiss a specific system alert |
