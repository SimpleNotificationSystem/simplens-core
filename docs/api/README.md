# Backend Notification Service — API Documentation

Complete API reference for the Notification Service. This document covers all endpoints, request/response formats, authentication, and webhook callbacks.

---

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Common Concepts](#common-concepts)
  - [Channels](#channels)
  - [Idempotency](#idempotency)
  - [Template Variables](#template-variables)
  - [Rate Limits](#rate-limits)
- [Endpoints](#endpoints)
  - [Health Check](#health-check)
  - [POST /notification](#post-notification)
  - [POST /notification/batch](#post-notificationbatch)
- [Webhook Callbacks](#webhook-callbacks)
- [Error Responses](#error-responses)

---

## Overview

| Base URL | Content-Type | Authentication |
|----------|--------------|----------------|
| `http://localhost:3000` | `application/json` | Bearer Token |

All requests and responses use JSON format.

---

## Authentication

All `/notification` endpoints require authentication via Bearer token in the `Authorization` header:

```http
Authorization: Bearer <your_api_key>
```

**Example:**
```bash
curl -X POST http://localhost:3000/notification \
  -H "Authorization: Bearer my-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{ ... }'
```

---

## Common Concepts

### Channels

The service supports two notification channels:

| Channel | Value | Description |
|---------|-------|-------------|
| Email | `email` | Send via SMTP (Gmail, etc.) |
| WhatsApp | `whatsapp` | Send via WhatsApp Business API |

You can send to multiple channels in a single request by including both in the `channel` array.

### Idempotency

The service ensures **exactly-once delivery** using the combination of `request_id` + `channel`:

- Duplicate requests with the same `request_id` and `channel` are **rejected** if a notification already exists with status `pending`, `processing`, or `delivered`.
- If the existing notification has status `failed`, a new notification is allowed (retry scenario).
- This enables **safe retries** — you can retry the same request without creating duplicates.

**Response for duplicates:**
```json
{
  "message": "Duplicate notification(s) already exist with non-failed status",
  "duplicateCount": 1,
  "duplicates": [{ "request_id": "req-123", "channel": "email" }]
}
```

### Template Variables

Use template variables to personalize messages for each recipient. Variables are replaced in both email and WhatsApp message content.

**Syntax:** `{{variable_name}}`

**Example — Email Template:**
```html
<h1>Hello, {{name}}!</h1>
<p>Your order #{{order_id}} has been shipped.</p>
<p>Tracking: {{tracking_number}}</p>
```

**Example — WhatsApp Template:**
```
Hi {{name}}, your order #{{order_id}} is on the way! Track: {{tracking_number}}
```

**Request with Variables:**
```json
{
  "recipients": [
    {
      "request_id": "order-001",
      "user_id": "user-1",
      "email": "alice@example.com",
      "variables": {
        "name": "Alice",
        "order_id": "ORD-12345",
        "tracking_number": "TRK-789"
      }
    },
    {
      "request_id": "order-002",
      "user_id": "user-2",
      "email": "bob@example.com",
      "variables": {
        "name": "Bob",
        "order_id": "ORD-12346",
        "tracking_number": "TRK-790"
      }
    }
  ],
  "content": {
    "email": {
      "subject": "Your Order Has Shipped!",
      "message": "<h1>Hello, {{name}}!</h1><p>Your order #{{order_id}} is on the way.</p>"
    }
  }
}
```

**Result for Alice:**
```html
<h1>Hello, Alice!</h1><p>Your order #ORD-12345 is on the way.</p>
```

### Rate Limits

- **Batch Size Limit:** Configurable via `MAX_BATCH_REQ_LIMIT` (default: 1000)
- **Delivery Rate Limiting:** Token bucket algorithm per channel to prevent provider throttling
- Requests exceeding limits receive `400 Bad Request`

---

## Endpoints

### Health Check

Check if the API server is running.

```http
GET /health
```

**Response:** `200 OK`
```json
{
  "status": "healthy",
  "timestamp": "2025-12-05T10:30:00.000Z"
}
```

---

### POST /notification

Send a single notification to one recipient. Supports multiple channels per request.

```http
POST /notification
Authorization: Bearer <api_key>
Content-Type: application/json
```

#### Request Body

```json
{
  "request_id": "unique-request-id",
  "client_id": "your-client-id",
  "client_name": "Your App Name",
  "channel": ["email", "whatsapp"],
  "recipient": {
    "user_id": "user-123",
    "email": "user@example.com",
    "phone": "+15551234567"
  },
  "content": {
    "email": {
      "subject": "Welcome to Our Service!",
      "message": "<h1>Hello!</h1><p>Thank you for signing up.</p>"
    },
    "whatsapp": {
      "message": "Hello! Thank you for signing up."
    }
  },
  "scheduled_at": "2025-12-10T15:30:00Z",
  "webhook_url": "https://your-app.com/webhooks/notification"
}
```

#### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `request_id` | string | ✅ | Unique identifier for idempotency |
| `client_id` | string | ✅ | Your application/client identifier |
| `client_name` | string | ❌ | Optional display name |
| `channel` | string[] | ✅ | Channels: `["email"]`, `["whatsapp"]`, or `["email", "whatsapp"]` |
| `recipient` | object | ✅ | Recipient details |
| `recipient.user_id` | string | ✅ | User identifier for tracking |
| `recipient.email` | string | Conditional | Required if channel includes `email` |
| `recipient.phone` | string | Conditional | Required if channel includes `whatsapp` (E.164 format) |
| `content` | object | ✅ | Message content per channel |
| `content.email` | object | Conditional | Required if channel includes `email` |
| `content.email.subject` | string | ✅ | Email subject line |
| `content.email.message` | string | ✅ | Email body (HTML supported) |
| `content.whatsapp` | object | Conditional | Required if channel includes `whatsapp` |
| `content.whatsapp.message` | string | ✅ | WhatsApp message text |
| `scheduled_at` | string | ❌ | ISO 8601 timestamp for scheduled delivery |
| `webhook_url` | string | ✅ | URL for delivery status callbacks |

#### Responses

**202 Accepted** — Notification queued for processing
```json
{
  "message": "Notifications are being processed"
}
```

**400 Bad Request** — Validation error
```json
{
  "message": "recipient.email is required for channel email",
  "errors": [{ "path": "recipient.email", "message": "Required" }]
}
```

**401 Unauthorized** — Invalid or missing API key
```json
{
  "message": "Unauthorized: invalid api_key"
}
```

**409 Conflict** — Duplicate notification exists
```json
{
  "message": "Duplicate notification(s) already exist with non-failed status",
  "duplicateCount": 1,
  "duplicates": [{ "request_id": "req-123", "channel": "email" }]
}
```

---

### POST /notification/batch

Send the same notification content to multiple recipients. Ideal for announcements, marketing campaigns, or bulk notifications. Use template variables to personalize each message.

```http
POST /notification/batch
Authorization: Bearer <api_key>
Content-Type: application/json
```

#### Request Body

```json
{
  "client_id": "your-client-id",
  "client_name": "Your App Name",
  "channel": ["email"],
  "content": {
    "email": {
      "subject": "Special Offer for {{name}}!",
      "message": "<h1>Hi {{name}}!</h1><p>Use code {{promo_code}} for 20% off.</p>"
    }
  },
  "recipients": [
    {
      "request_id": "promo-user-1",
      "user_id": "user-1",
      "email": "alice@example.com",
      "variables": {
        "name": "Alice",
        "promo_code": "ALICE20"
      }
    },
    {
      "request_id": "promo-user-2",
      "user_id": "user-2",
      "email": "bob@example.com",
      "variables": {
        "name": "Bob",
        "promo_code": "BOB20"
      }
    }
  ],
  "scheduled_at": "2025-12-10T09:00:00Z",
  "webhook_url": "https://your-app.com/webhooks/notification"
}
```

#### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `client_id` | string | ✅ | Your application/client identifier |
| `client_name` | string | ❌ | Optional display name |
| `channel` | string[] | ✅ | Channels (applies to all recipients) |
| `content` | object | ✅ | Shared message template (supports `{{variables}}`) |
| `recipients` | array | ✅ | Array of recipient objects |
| `recipients[].request_id` | string | ✅ | Unique ID per recipient for tracking |
| `recipients[].user_id` | string | ✅ | User identifier |
| `recipients[].email` | string | Conditional | Required if channel includes `email` |
| `recipients[].phone` | string | Conditional | Required if channel includes `whatsapp` |
| `recipients[].variables` | object | ❌ | Key-value pairs for template substitution |
| `scheduled_at` | string | ❌ | ISO 8601 timestamp (applies to all) |
| `webhook_url` | string | ✅ | URL for delivery callbacks |

#### Counting Notifications

Each recipient × channel combination counts as one notification:

| Recipients | Channels | Total Notifications |
|------------|----------|---------------------|
| 100 | `["email"]` | 100 |
| 100 | `["email", "whatsapp"]` | 200 |
| 50 | `["whatsapp"]` | 50 |

#### Responses

**202 Accepted** — Batch queued for processing
```json
{
  "message": "Notifications are being processed"
}
```

**400 Bad Request** — Validation error or batch limit exceeded
```json
{
  "message": "Batch size (1500) exceeds limit (1000)."
}
```

---

## Webhook Callbacks

When a notification is delivered or fails, the service sends a POST request to your `webhook_url`.

### Webhook Request

```http
POST <your_webhook_url>
Content-Type: application/json
```

```json
{
  "request_id": "unique-request-id",
  "client_id": "your-client-id",
  "notification_id": "648a1f2b3c4d5e6f7a8b9c0d",
  "status": "DELIVERED",
  "channel": "email",
  "message": "Email sent successfully",
  "occurred_at": "2025-12-05T10:35:00.000Z"
}
```

### Webhook Fields

| Field | Type | Description |
|-------|------|-------------|
| `request_id` | string | Your original request ID |
| `client_id` | string | Your client ID |
| `notification_id` | string | Internal notification ID |
| `status` | string | `DELIVERED` or `FAILED` |
| `channel` | string | `email` or `whatsapp` |
| `message` | string | Success message or error reason |
| `occurred_at` | string | ISO 8601 timestamp of the event |

### Expected Response

Return `200 OK` to acknowledge receipt:
```json
{
  "received": true
}
```

### Webhook Reliability

- **Retries:** The service will retry on `5xx` errors
- **Idempotency:** Webhooks may be delivered more than once — implement idempotent handling
- **Timeouts:** Respond within 30 seconds

### Webhook URL for Docker

When running the notification service inside Docker containers and your webhook server is running on the host machine, use `host.docker.internal` instead of `localhost`:

| Service Location | Webhook URL |
|-----------------|-------------|
| Both on host machine | `http://localhost:4000/webhook` |
| Service in Docker, webhook on host | `http://host.docker.internal:4000/webhook` |
| Both in Docker (same network) | `http://container-name:4000/webhook` |

**Example:**
```json
{
  "webhook_url": "http://host.docker.internal:4000/webhook"
}
```

---

## Error Responses

All error responses follow this format:

```json
{
  "message": "Human-readable error message",
  "errors": [
    { "path": "field.path", "message": "Specific error" }
  ]
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| `200` | Success (health check) |
| `202` | Accepted — notification queued |
| `400` | Bad Request — validation error |
| `401` | Unauthorized — invalid API key |
| `409` | Conflict — duplicate notification |
| `500` | Internal Server Error |

---

## Examples

### Send Welcome Email

```bash
curl -X POST http://localhost:3000/notification \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "welcome-user-123",
    "client_id": "my-app",
    "channel": ["email"],
    "recipient": {
      "user_id": "user-123",
      "email": "newuser@example.com"
    },
    "content": {
      "email": {
        "subject": "Welcome to Our Platform!",
        "message": "<h1>Welcome!</h1><p>We are excited to have you on board.</p>"
      }
    },
    "webhook_url": "https://my-app.com/webhooks"
  }'
```

### Send Scheduled Batch with Variables

```bash
curl -X POST http://localhost:3000/notification/batch \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "my-app",
    "channel": ["email", "whatsapp"],
    "content": {
      "email": {
        "subject": "Your Weekly Summary, {{name}}",
        "message": "<p>Hi {{name}}, you completed {{tasks}} tasks this week!</p>"
      },
      "whatsapp": {
        "message": "Hi {{name}}! You completed {{tasks}} tasks this week. Great job!"
      }
    },
    "recipients": [
      {
        "request_id": "weekly-1",
        "user_id": "u1",
        "email": "alice@example.com",
        "phone": "+15551111111",
        "variables": { "name": "Alice", "tasks": "12" }
      },
      {
        "request_id": "weekly-2",
        "user_id": "u2",
        "email": "bob@example.com",
        "phone": "+15552222222",
        "variables": { "name": "Bob", "tasks": "8" }
      }
    ],
    "scheduled_at": "2025-12-09T09:00:00Z",
    "webhook_url": "https://my-app.com/webhooks"
  }'
```

---

## Notes

- **Scheduled Notifications:** If `scheduled_at` is in the past, the notification is processed immediately.
- **Retry Count:** The service automatically resets negative retry counts to 0.
- **Phone Format:** Use E.164 format for WhatsApp (e.g., `+15551234567`).
