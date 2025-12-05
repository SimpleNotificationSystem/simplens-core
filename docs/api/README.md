# Backend Notification Service API

This document describes the Notification Service API for sending single and batch notifications (email and whatsapp) and the webhook format for delivery callbacks.

---

## 1. Common notes
- Content-Type: `application/json`
- All requests are expected to be JSON.
- Authentication: Pass `api_key` in the HTTP `Authorization` header as a Bearer token:
  ```
  Authorization: Bearer <api_key>
  ```
- Channel enum: `email`, `whatsapp`
- `webhook_url` is used to receive asynchronous delivery updates for each notification.

### Idempotency
- Duplicate requests with the same `request_id` and `channel` are automatically rejected if a notification with status `pending`, `processing`, or `delivered` already exists.
- This ensures safe retries without creating duplicate notifications.
- If the existing notification has status `failed`, a new notification with the same `request_id` and `channel` is allowed.

### Rate Limits
- Batch requests are limited to a maximum number of recipients (configured via `MAX_BATCH_REQ_LIMIT` environment variable).
- Requests exceeding this limit will receive a `400 Bad Request` response.

---

## 2. POST /notification (send a single notification)

Description: Enqueue a single notification for asynchronous processing and delivery.

**Authentication:** Requires `api_key` in the HTTP `Authorization` header:
```
Authorization: Bearer <api_key>
```

Request Body:
```json
{
  "request_id": "unique_request_id",
  "client_id": "unique_client_id",
  "client_name": "client_name", // optional
  "channel": ["email", "whatsapp"],
  "recipient": {
    "user_id": "user_id",
    "email": "user@example.com", // optional (required for email)
    "phone": "+15552223333" // optional (required for whatsapp)
  },
  "content": {
    "email": { // required when the channel is email
        "message": "html content",
        "subject": "email subject",
    },
    "whatsapp": { // required when the channel is whatsapp
        "message": "string"
    }
  },
  "scheduled_at": "2025-12-03T15:30:00Z", // optional, ISO 8601
  "webhook_url": "https://example.com/notifications/callback"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `request_id` | Yes | Unique identifier for this notification request |
| `client_id` | Yes | Unique identifier for the client |
| `client_name` | No | Optional client name |
| `channel` | Yes | Array of channels: `email`, `whatsapp` |
| `recipient` | Yes | Recipient object |
| `recipient.user_id` | Yes | User identifier for tracking |
| `recipient.email` | Conditional | Required if channel includes email |
| `recipient.phone` | Conditional | Required if channel includes whatsapp |
| `content` | Yes | Content object containing channel-specific message data |
| `content.email` | Conditional | Required when channel includes email |
| `content.email.message` | Conditional | HTML content for the email body |
| `content.email.subject` | Conditional | Subject line for the email |
| `content.whatsapp` | Conditional | Required when channel includes whatsapp |
| `content.whatsapp.message` | Conditional | Text content for the whatsapp message |
| `scheduled_at` | No | ISO 8601 timestamp for scheduled delivery |
| `webhook_url` | Yes | URL to receive delivery callbacks |

Responses:
- 202 Accepted
  ```json
  {
    "message": "Notification accepted and will be processed"
  }
  ```
- 400 Bad Request — invalid payload (e.g., missing required fields, invalid email)
  ```json
  {
    "message": "Validation error: recipient.email is required for channel email",
    "errors": [{ "path": "recipient.email", "message": "Required" }]
  }
  ```
- 401 Unauthorized — invalid `api_key`
  ```json
  {
    "message": "Unauthorized: invalid api_key"
  }
  ```
- 409 Conflict — duplicate notification (same `request_id` and `channel` already exists with non-failed status)
  ```json
  {
    "message": "Duplicate notification(s) already exist with non-failed status",
    "duplicateCount": 1,
    "duplicates": [{ "request_id": "...", "channel": "email" }]
  }
  ```
- 500 Internal Server Error — unexpected server error
  ```json
  {
    "message": "Internal Server Error"
  }
  ```

Notes:
- When the notification is processed and delivered (or fails), the service will POST a delivery callback to the provided `webhook_url` using the webhook format (see section 4).
- When the scheduled date and time is in the past, it pushes the event to corresponding topics [email or whatsapp] rather than discarding the event
- When the retry count is -ve or +ve, it always sets the retry_count to 0
---

## 3. POST /notification/batch (send same content to multiple recipients)

Description: Send the same notification content to multiple recipients in a single API call. Ideal for bulk announcements, marketing campaigns, or any scenario where the message is identical for all recipients.

**Authentication:** Requires `api_key` in the HTTP `Authorization` header:
```
Authorization: Bearer <api_key>
```

Request Body:
```json
{
  "client_id": "unique_client_id",
  "client_name": "client_name", // optional
  "channel": ["email"], // ENUM: email, whatsapp — applies to all recipients
  "content": {
    "email": { // required when the channel is email
        "message": "html content",
        "subject": "email subject",
    },
    "whatsapp": { // required when the channel is whatsapp
        "message": "string"
    }
  },
  "recipients": [
    {
      "request_id": "r-1", // unique per recipient for tracking
      "user_id": "user_id_1",
      "email": "user1@example.com", // required for email
      "phone": "+15551112222", // required for whatsapp
      "variables": { // variables will be injected into the template html content and whatsapp message
        "name": "Alice"
      }
    },
    {
      "request_id": "r-2",
      "user_id": "user_id_2",
      "email": "user2@example.com",
      "variables": { // variables will be injected into the template html content and whatsapp message
        "name": "Bob"
      }
    }
  ],
  "scheduled_at": "2025-12-03T15:30:00Z", // optional, ISO 8601 — applies to all
  "webhook_url": "https://example.com/notifications/callback"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `client_id` | Yes | Unique identifier for the client |
| `client_name` | No | Optional client name |
| `channel` | Yes | Array of channels: `email`, `whatsapp` — applies to all recipients |
| `content` | Yes | Content object containing channel-specific message data (shared by all recipients) |
| `content.email` | Conditional | Required when channel includes email |
| `content.email.message` | Conditional | HTML content for the email body (supports variable injection) |
| `content.email.subject` | Conditional | Subject line for the email |
| `content.whatsapp` | Conditional | Required when channel includes whatsapp |
| `content.whatsapp.message` | Conditional | Text content for the whatsapp message (supports variable injection) |
| `recipients` | Yes | Array of recipient objects |
| `recipients[].request_id` | Yes | Unique ID for tracking each recipient's notification |
| `recipients[].user_id` | Yes | User identifier for tracking |
| `recipients[].email` | Conditional | Required if channel includes email |
| `recipients[].phone` | Conditional | Required if channel includes whatsapp |
| `recipients[].variables` | No | Key-value pairs to inject into the content template (e.g., `{"name": "Alice"}`) |
| `scheduled_at` | No | ISO 8601 timestamp for scheduled delivery — applies to all recipients |
| `webhook_url` | Yes | URL to receive delivery callbacks |

Responses:
- 202 Accepted — The batch was accepted and will be processed asynchronously.
  ```json
  {
    "message": "Notifications are being processed"
  }
  ```
- 400 Bad Request — malformed request, validation errors, or batch size exceeds limit:
  ```json
  {
    "message": "Validation error: some notifications are invalid",
    "errors": [{ "path": "recipients.0.email", "message": "Required" }]
  }
  ```
  Or if batch size exceeds limit:
  ```json
  {
    "message": "Batch size (150) exceeds limit (100)."
  }
  ```
- 401 Unauthorized — invalid `api_key`
  ```json
  {
    "message": "Unauthorized: invalid api_key"
  }
  ```
- 409 Conflict — some notifications are duplicates (same `request_id` and `channel` already exist with non-failed status)
  ```json
  {
    "message": "Duplicate notification(s) already exist with non-failed status",
    "duplicateCount": 2,
    "duplicates": [
      { "request_id": "r-1", "channel": "email" },
      { "request_id": "r-2", "channel": "email" }
    ]
  }
  ```
- 500 Internal Server Error — unexpected server error
  ```json
  {
    "message": "Internal Server Error"
  }
  ```

---

## 4. Delivery webhook (callback) format

Description: When a notification is delivered or failed, the service will send a POST request to your `webhook_url` per notification

Webhook Request Body:
```json
{
  "request_id": "unique_request_id",
  "client_id": "unique_client_id",
  "notification_id": "unique id for each notification (created by the notification service)",
  "status": "DELIVERED", // ENUM: DELIVERED, FAILED
  "channel": "email", // ENUM: email, whatsapp
  "message": "Final delivery message (e.g., accepted by provider, or the error reason)",
  "occured_at": "timestamp of the actual event event"
}
```

Webhook Response Codes:
- 200 OK — webhook processed successfully
- 500 Internal Server Error — error processing webhook on your end (the notification service may retry delivery)

Notes:
- The webhook will be delivered per-notification, i.e., each notification produces a callback with its `request_id`.
- The service should retry webhooks on 5xx errors and potentially on timeouts. Implement idempotency for your endpoint — webhooks may be delivered more than once.
