# Backend Notification Service API

This document describes the Notification Service API for sending single and batch notifications (EMAIL and WHATSAPP) and the webhook format for delivery callbacks.

---

## 1. Common notes
- Content-Type: `application/json`
- All requests are expected to be JSON.
- Authentication: `api_key` (sent as part of the request body based on current schema)
- Channel enum: `EMAIL`, `WHATSAPP`
- `webhook_url` is used to receive asynchronous delivery updates for each notification.

---

## 2. POST /notification (send a single notification)

Description: Enqueue a single notification for asynchronous processing and delivery.

Request Body:
```json
{
  "request_id": "unique_request_id",
  "client_id": "unique_client_id",
  "client_name": "client_name", // optional
  "api_key": "api_key",
  "channel": ["EMAIL", "WHATSAPP"],
  "recipient": {
    "user_id": "user_id",
    "email": "user@example.com", // optional (required for EMAIL)
    "subject": "Email Subject",  // optional (for EMAIL)
    "phone": "+15552223333" // optional (required for WHATSAPP)
  },
  "content": "string (HTML for email or text for whatsapp)",
  "scheduled_at": "2025-12-03T15:30:00Z", // optional, ISO 8601
  "webhook_url": "https://example.com/notifications/callback"
}
```

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
    "message": "Validation error: recipient.email is required for channel EMAIL"
  }
  ```
- 401 Unauthorized — invalid `api_key`
  ```json
  {
    "message": "Unauthorized: invalid api_key"
  }
  ```
- 500 Internal Server Error — unexpected server error
  ```json
  {
    "message": "Internal Server Error. Please try again later."
  }
  ```

Notes:
- When the notification is processed and delivered (or fails), the service will POST a delivery callback to the provided `webhook_url` using the webhook format (see section 4).

---

## 3. POST /notification/batch (send multiple notifications in one request)

Description: Enqueue multiple notifications as part of a single API call. Each item in `notifications` is processed independently but the request is accepted/validated as a whole.

Request Body:
```json
{
  "client_id": "unique_client_id",
  "client_name": "client_name", // optional
  "api_key": "api_key",
  "notifications": [
    {
      "request_id": "unique_request_id",
      "channel": ["EMAIL"],
      "recipient": {
        "user_id": "user_id",
        "email": "user@example.com",
        "subject": "Subject"
      },
      "content": "<p>Hello user</p>",
      "scheduled_at": "2025-12-03T15:30:00Z"
    }
  ],
  "webhook_url": "https://example.com/notifications/callback"
}
```

Responses:
- 202 Accepted — The batch was accepted and will be processed asynchronously.
  ```json
  {
    "message": "Batch accepted; notifications enqueued for processing",
    "rejected_notifications": [] // array of request_ids that were rejected during validation
  }
  ```
- 400 Bad Request — malformed request or validation errors. If possible, return the list of invalid notifications in `rejected_notifications`:
  ```json
  {
    "message": "Validation error: some notifications are invalid",
    "rejected_notifications": ["request-id-1", "request-id-3"]
  }
  ```
- 401 Unauthorized — invalid `api_key`
  ```json
  {
    "message": "Unauthorized: invalid api_key"
  }
  ```
- 500 Internal Server Error — unexpected server error
  ```json
  {
    "message": "Internal Server Error. Please try again later."
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
  "status": "DELIVERED", // ENUM: DELIVERED, FAILED
  "channel": "EMAIL", // ENUM: EMAIL, WHATSAPP
  "message": "Final delivery message (e.g., accepted by provider, or the error reason)"
}
```

Webhook Response Codes:
- 200 OK — webhook processed successfully
- 500 Internal Server Error — error processing webhook on your end (the notification service may retry delivery)

Notes:
- The webhook will be delivered per-notification, i.e., each notification produces a callback with its `request_id`.
- The service should retry webhooks on 5xx errors and potentially on timeouts. Implement idempotency for your endpoint — webhooks may be delivered more than once.
