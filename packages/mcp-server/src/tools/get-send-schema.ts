/**
 * Tool: get_send_schema
 * Returns full schema documentation for sending notifications.
 * Replaces MCP resources — agents interact with tools more reliably.
 */

import { z } from 'zod';
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
| webhook_url | URL | Callback URL for delivery status |

## Content (one of these is required)

| Field | Type | Description |
|-------|------|-------------|
| template_id | string[] | Array of pre-configured template IDs (one per channel, in the same order) |
| content | object | Inline content keyed by channel name (e.g. { "email": { "subject": "...", "message": "..." } }) |

> **Rule**: Either \`template_id\` or \`content\` must be provided. If using templates, you can still provide \`content\` for channels without a template.

## Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| client_name | string | Human-readable name for the client |
| provider | string[] | Specific providers (must match channel length) |
| variables | Record<string, string> | Template variables for interpolation (e.g. { "name": "John" }) |
| scheduled_at | ISO datetime | Schedule for future delivery |

## Example: Email with Inline Content

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

## Example: Email with Template

\`\`\`json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "client_id": "660e8400-e29b-41d4-a716-446655440001",
  "channel": ["email"],
  "template_id": ["welcome-email"],
  "recipient": {
    "user_id": "user123",
    "email": "user@example.com"
  },
  "variables": { "name": "John" },
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
| recipients | array | Array of recipient objects |
| webhook_url | URL | Callback URL for delivery status |

## Content (one of these is required)

| Field | Type | Description |
|-------|------|-------------|
| template_id | string[] | Array of pre-configured template IDs (one per channel) |
| content | object | Shared inline content keyed by channel name |

## Recipient Object

| Field | Type | Description |
|-------|------|-------------|
| request_id | UUIDV4 | Unique ID per recipient (required) |
| user_id | string | Recipient identifier (required) |
| variables | Record<string, string> | Per-recipient template variables |
| ...channel fields | varies | Channel-specific recipient fields (e.g. "email" for email channel) |

## Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| client_name | string | Human-readable client name |
| provider | string or string[] | Specific providers |
| scheduled_at | ISO datetime | Schedule for future delivery |

## Example: Email Batch with Inline Content

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

## Example: Batch with Template

\`\`\`json
{
  "client_id": "660e8400-e29b-41d4-a716-446655440001",
  "channel": ["email"],
  "template_id": ["welcome-email"],
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

export function registerGetSendSchema(server: McpServer) {
    server.registerTool(
        'get_send_schema',
        {
            description:
                'Get the full request schema documentation with examples for sending notifications. ' +
                'Call this BEFORE send_notification or send_batch_notification if you are unsure about the payload format. ' +
                'Returns detailed field descriptions, required/optional fields, and complete JSON examples.',
            inputSchema: {
                type: z
                    .enum(['notification', 'batch'])
                    .describe('Which schema to retrieve: "notification" for single send, "batch" for batch send'),
            },
        },
        async (params) => {
            const doc = params.type === 'notification' ? NOTIFICATION_SCHEMA_DOC : BATCH_SCHEMA_DOC;
            return {
                content: [{ type: 'text' as const, text: doc }],
            };
        }
    );
}
