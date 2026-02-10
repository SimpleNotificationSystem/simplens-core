/**
 * MCP Resources
 * 
 * Provides schema documentation as MCP resources for LLM context.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const NOTIFICATION_SCHEMA_DOC = `# SimpleNS Single Notification Request Schema

Send a notification to one recipient via one or more channels.

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| request_id | UUIDV4 | Unique identifier for this request |
| client_id | UUIDV4 | Your application/client identifier |
| channel | string[] | Channels to send via (e.g. ["email"]) |
| recipient | object | Recipient details (fields depend on channel) |
| content | object | Notification content (fields depend on channel) |
| webhook_url | URL | Callback URL for delivery status |

## Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| client_name | string | Human-readable name for the client |
| provider | string[] | Specific providers (must match channel length) |
| variables | Record<string, string> | Template variables |
| scheduled_at | ISO datetime | Schedule for future delivery |

## Example (Email)

\`\`\`json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "client_id": "660e8400-e29b-41d4-a716-446655440001",
  "channel": ["email"],
  "recipient": {
    "user_id": "user123",
    "email": "user@example.com"
  },
  "content": {
    "email": {
      "subject": "Hello from SimpleNS",
      "message": "<h1>Welcome!</h1><p>Your notification system is working.</p>"
    }
  },
  "webhook_url": "https://your-app.com/webhook"
}
\`\`\`

> **Tip**: Use the \`list_plugins\` tool to discover available channels and their required recipient/content fields.
`;

const BATCH_SCHEMA_DOC = `# SimpleNS Batch Notification Request Schema

Send the same notification content to multiple recipients at once.

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| client_id | UUIDV4 | Your application/client identifier |
| channel | string[] | Channels to send via |
| content | object | Shared content for all recipients |
| recipients | array | Array of recipient objects |
| webhook_url | URL | Callback URL for delivery status |

## Recipient Object

| Field | Type | Description |
|-------|------|-------------|
| request_id | UUIDV4 | Unique ID per recipient (required) |
| user_id | string | Recipient identifier (required) |
| variables | Record<string, string> | Per-recipient template variables |
| ...channel fields | varies | Channel-specific recipient fields |

## Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| client_name | string | Human-readable client name |
| provider | string or string[] | Specific providers |
| scheduled_at | ISO datetime | Schedule for future delivery |

## Example (Email Batch)

\`\`\`json
{
  "client_id": "660e8400-e29b-41d4-a716-446655440001",
  "channel": ["email"],
  "content": {
    "email": {
      "subject": "Hello {{name}}!",
      "message": "<p>Welcome to our service, {{name}}!</p>"
    }
  },
  "recipients": [
    {
      "request_id": "550e8400-e29b-41d4-a716-446655440000",
      "user_id": "user1",
      "email": "alice@example.com",
      "variables": { "name": "Alice" }
    },
    {
      "request_id": "550e8400-e29b-41d4-a716-446655440001",
      "user_id": "user2",
      "email": "bob@example.com",
      "variables": { "name": "Bob" }
    }
  ],
  "webhook_url": "https://your-app.com/webhook"
}
\`\`\`
`;

export function registerAllResources(server: McpServer) {
    server.resource(
        'notification_schema',
        'simplens://schema/notification',
        {
            description: 'Documentation for the single notification request schema. Shows required fields, optional fields, and an example payload.',
            mimeType: 'text/markdown',
        },
        async () => ({
            contents: [{
                uri: 'simplens://schema/notification',
                mimeType: 'text/markdown',
                text: NOTIFICATION_SCHEMA_DOC,
            }],
        })
    );

    server.resource(
        'batch_schema',
        'simplens://schema/batch',
        {
            description: 'Documentation for the batch notification request schema. Shows required fields, recipient format, and an example payload.',
            mimeType: 'text/markdown',
        },
        async () => ({
            contents: [{
                uri: 'simplens://schema/batch',
                mimeType: 'text/markdown',
                text: BATCH_SCHEMA_DOC,
            }],
        })
    );
}
