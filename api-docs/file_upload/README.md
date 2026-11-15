# File Upload & Attachment API Documentation

The **File Upload API** in SimpleNS allows clients and notification services to upload, inspect, and download attachments (such as PDFs, invoices, images, and documents). Incoming files are **streamed directly** into the active configured storage provider (e.g. MinIO, S3) without buffering entire files into server RAM or writing to temporary disk files.

---

## Architecture & Scalability Highlights

* **Direct-to-Storage Streaming**: Files stream chunk-by-chunk directly from the HTTP socket into the storage provider via S3 multipart streaming. Memory consumption is limited to small stream chunks (~5MB per active upload in MinIO SDK), preventing Node.js Out-Of-Memory (OOM) crashes.
* **SimpleNS Hard Limits**:
  * **Max File Size**: **100 MB** per file (`SIMPLENS_MAX_FILE_SIZE = 104,857,600` bytes).
  * **Max File Count**: **10 files** per upload request (`SIMPLENS_MAX_FILE_COUNT = 10`).
  * **Worst-Case Transfer Capacity**: Up to **1 GB** in a single multipart request (10 files × 100 MB).
* **Provider Limit Enforcement**: When `channel` and `provider` query parameters are supplied, SimpleNS checks the notification provider's dynamic limits from MongoDB (falling back to plugin `getFileAttachmentConfig` defaults) and enforces the stricter ceiling (e.g. if Resend enforces 25MB, SimpleNS limits the upload to 25MB).
* **Dynamic Operational Configuration**: Global limits can be adjusted live with zero downtime via the Admin Dashboard under **Settings > File Attachment Settings** or via `PUT /api/settings`.
* **Deduplication & Concurrency Locks**: Concurrent uploads of the exact same file (identical SHA-256 and filename) are serialized using an atomic, TTL-backed MongoDB distributed lock. The identical upload is deduplicated without wasting storage or duplicating records.

---

## Authentication

All `/api/file` endpoints accept dual authentication:
1. **API Key**: Passed in headers:
   * `Authorization: Bearer <API_KEY>` or
   * `x-api-key: <API_KEY>`
2. **Dashboard Session Cookie**:
   * `simplens_session=<JWT_TOKEN>` (HTTP-only cookie sent automatically by browsers).

---

## Endpoints

### 1. Upload Files
Upload one or multiple files directly streaming to the active storage provider.

* **Method**: `POST`
* **Path**: `/api/file/upload`
* **Content-Type**: `multipart/form-data`
* **Field Name**: `files` (repeated for multiple files) or any multipart file field name

#### Query Parameters (Optional)

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `channel` | `string` | Target notification channel (e.g., `email`, `discord`). Used to look up channel attachment rules. |
| `provider` | `string` | Target provider ID (e.g., `resend-prod`, `sendgrid-backup`). Enforces provider-specific limits. |

#### Limits & Validation
* If no active storage provider is enabled in SimpleNS, the request is rejected with `400 Bad Request`.
* If a file exceeds the effective file size limit (max 100MB by default), the upload is immediately halted and returns `400 Bad Request`.
* If more than the allowed number of files are attached (max 10 by default), returns `400 Bad Request`.
* If allowed MIME types are defined by the provider and an unsupported type is sent, returns `400 Bad Request`.

#### cURL Examples

**Single File Upload:**
```bash
curl -X POST "http://localhost:3000/api/file/upload?channel=email&provider=resend-primary" \
  -H "Authorization: Bearer sns_live_your_api_key_here" \
  -F "files=@/path/to/invoice.pdf"
```

**Multiple Files Upload (up to 10 files):**
```bash
curl -X POST "http://localhost:3000/api/file/upload" \
  -H "Authorization: Bearer sns_live_your_api_key_here" \
  -F "files=@/path/to/report.pdf" \
  -F "files=@/path/to/receipt.png"
```

#### Node.js / Axios Example
```typescript
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

const form = new FormData();
form.append('files', fs.createReadStream('./document.pdf'));

const response = await axios.post('http://localhost:3000/api/file/upload', form, {
  params: { channel: 'email', provider: 'resend-primary' },
  headers: {
    ...form.getHeaders(),
    'Authorization': 'Bearer sns_live_your_api_key_here',
  },
});

console.log(response.data);
```

#### Success Response (`200 OK`)
```json
{
  "success": true,
  "files": [
    {
      "id": "c8e23b44-b258-4034-8c01-7fa1e5d7621c",
      "filename": "invoice.pdf",
      "mime_type": "application/pdf",
      "size": 524288,
      "hash": "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
      "url": "http://localhost:9000/simplens-attachments/attachments/b94d27b9.../invoice.pdf?X-Amz-...",
      "created_at": "2026-11-09T14:30:00.000Z"
    }
  ]
}
```

#### Error Responses

* **No Files Provided (`400 Bad Request`)**:
  ```json
  {
    "success": false,
    "error": "No files provided in upload request"
  }
  ```

* **No Active Storage Provider (`400 Bad Request`)**:
  ```json
  {
    "success": false,
    "error": "No active storage provider configured. Enable at most one active storage provider to attach files."
  }
  ```

* **File Size Exceeded (`400 Bad Request`)**:
  ```json
  {
    "success": false,
    "error": "File size exceeds maximum allowed limit of 104857600 bytes (~100MB)"
  }
  ```

* **File Count Exceeded (`400 Bad Request`)**:
  ```json
  {
    "success": false,
    "error": "Cannot upload more than 10 files per request"
  }
  ```

* **Unsupported MIME Type (`400 Bad Request`)**:
  ```json
  {
    "success": false,
    "error": "File 'script.exe' has unsupported MIME type 'application/x-msdownload'. Allowed types: application/pdf, image/*"
  }
  ```

* **Client Abort / Disconnect (`400 Bad Request`)**:
  ```json
  {
    "success": false,
    "error": "Upload aborted by client or network interruption"
  }
  ```

---

### 2. Get File Metadata
Retrieve stored metadata for an uploaded file using its unique `file_id`.

* **Method**: `GET`
* **Path**: `/api/file/:id`

#### cURL Example
```bash
curl -X GET "http://localhost:3000/api/file/c8e23b44-b258-4034-8c01-7fa1e5d7621c" \
  -H "Authorization: Bearer sns_live_your_api_key_here"
```

#### Success Response (`200 OK`)
```json
{
  "success": true,
  "file": {
    "id": "c8e23b44-b258-4034-8c01-7fa1e5d7621c",
    "filename": "invoice.pdf",
    "mime_type": "application/pdf",
    "size": 524288,
    "hash": "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    "url": "http://localhost:9000/simplens-attachments/attachments/b94d27b9.../invoice.pdf?X-Amz-...",
    "created_at": "2026-11-09T14:30:00.000Z"
  }
}
```

#### File Not Found (`404 Not Found`)
```json
{
  "success": false,
  "error": "File not found"
}
```

---

### 3. Download File Content
Stream or download the actual file binary content from the storage provider.

* **Method**: `GET`
* **Path**: `/api/file/:id/download`

#### Response Headers
* `Content-Type`: MIME type of the file (e.g. `application/pdf`).
* `Content-Disposition`: `attachment; filename="invoice.pdf"`

#### cURL Example
```bash
curl -L -O -J "http://localhost:3000/api/file/c8e23b44-b258-4034-8c01-7fa1e5d7621c/download" \
  -H "Authorization: Bearer sns_live_your_api_key_here"
```

---

## Attaching Uploaded Files to Notifications

To attach uploaded files to notification dispatch requests (`POST /api/notification` or `POST /api/notification/batch`), include the attachment object in the channel content payload:

```json
{
  "request_id": "84d59a58-6da3-47be-a5e2-225e378bc88b",
  "client_id": "client-1234",
  "channel": ["email"],
  "recipient": {
    "user_id": "usr_99",
    "email": "recipient@example.com"
  },
  "content": {
    "email": {
      "subject": "Monthly Statement",
      "body": "Please find your attached monthly statement.",
      "attachments": [
        {
          "id": "c8e23b44-b258-4034-8c01-7fa1e5d7621c",
          "filename": "invoice.pdf",
          "mime_type": "application/pdf",
          "size": 524288,
          "hash": "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
          "url": "http://localhost:9000/simplens-attachments/attachments/b94d.../invoice.pdf"
        }
      ]
    }
  }
}
```
