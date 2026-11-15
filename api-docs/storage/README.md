# Storage Provider Management API Documentation

SimpleNS provides a pluggable, secure storage provider subsystem for persisting notification attachments (e.g. PDFs, images, receipts). Attachments are streamed directly to the configured storage provider (such as MinIO or S3-compatible object stores) without buffering entire files in memory or writing temporary files to disk.

---

## Storage Architecture & Core Invariants

1. **Pluggable Providers**: SimpleNS supports multiple storage provider backends (e.g. MinIO, Amazon S3, Azure Blob, Google Cloud Storage) through a standardized interface.
2. **Single Active Provider Invariant**: Only **one** storage provider can be `is_active: true` at any given time.
   - Activating a provider automatically demotes all other configured providers (`is_active: false`) and ensures the activated provider is `enabled: true`.
   - File uploads via `/api/file/upload` stream strictly to the active provider. If no active provider exists or is enabled, upload requests fail with `400 Bad Request`.
3. **Encrypted Credentials**: Storage provider credentials (endpoints, access keys, secret keys, tokens) are automatically encrypted at rest using AES-256-GCM via the SimpleNS encryption key manager before being persisted to MongoDB. Listing endpoints mask/omit raw credentials.

---

## Authentication

All `/api/storage` routes are protected by `auth_middleware` and support dual authentication:

1. **API Key**: Pass via header:
   - `Authorization: Bearer <API_KEY>` or
   - `x-api-key: <API_KEY>`
2. **Admin Session Cookie**:
   - `simplens_session=<JWT>` (sent automatically by the Next.js Dashboard).

---

## Endpoints

### 1. Check Active Storage Status
Check if a storage provider is configured and currently active.

- **Method**: `GET`
- **Path**: `/api/storage/status`
- **Authentication**: Bearer / Session

#### Response Example (`200 OK`)
```json
{
  "hasActiveProvider": true,
  "activeProvider": {
    "id": "6735c0ffee00000000000001",
    "name": "Local MinIO Storage",
    "provider_type": "minio"
  }
}
```

When no provider is active:
```json
{
  "hasActiveProvider": false
}
```

---

### 2. List Available Storage Provider Types
Retrieve available storage provider types and their dynamic credential schemas for UI form rendering and client validation.

- **Method**: `GET`
- **Path**: `/api/storage/providers`
- **Authentication**: Bearer / Session

#### Response Example (`200 OK`)
```json
{
  "providers": [
    {
      "type": "minio",
      "name": "MinIO / S3 Compatible Storage",
      "description": "High-performance S3-compatible object storage server.",
      "credentialSchema": [
        {
          "name": "endPoint",
          "type": "string",
          "label": "Endpoint Host",
          "placeholder": "e.g. localhost or play.min.io",
          "description": "MinIO server hostname or IP address (without http:// or https://)",
          "required": true
        },
        {
          "name": "port",
          "type": "string",
          "label": "Port",
          "placeholder": "e.g. 9000",
          "description": "Port number (default: 9000)",
          "required": false
        },
        {
          "name": "useSSL",
          "type": "boolean",
          "label": "Use SSL (HTTPS)",
          "description": "Enable SSL for secure HTTPS connection",
          "required": false
        },
        {
          "name": "accessKey",
          "type": "string",
          "label": "Access Key",
          "placeholder": "MinIO access key / username",
          "required": true
        },
        {
          "name": "secretKey",
          "type": "password",
          "label": "Secret Key",
          "placeholder": "MinIO secret key / password",
          "required": true
        },
        {
          "name": "bucket",
          "type": "string",
          "label": "Bucket Name",
          "placeholder": "e.g. simplens-attachments",
          "description": "S3 / MinIO bucket name (auto-created if permissions allow)",
          "required": true
        },
        {
          "name": "region",
          "type": "string",
          "label": "Region",
          "placeholder": "e.g. us-east-1",
          "description": "Storage region (default: us-east-1)",
          "required": false
        },
        {
          "name": "publicUrl",
          "type": "string",
          "label": "Public Base URL",
          "placeholder": "e.g. https://cdn.example.com",
          "description": "Optional custom CDN or public base URL for generated file download URLs",
          "required": false
        }
      ]
    }
  ]
}
```

---

### 3. Test Storage Connection
Test candidate storage credentials and connectivity prior to saving.

- **Method**: `POST`
- **Path**: `/api/storage/test`
- **Authentication**: Bearer / Session

#### Request Body
```json
{
  "provider_type": "minio",
  "config": {
    "endPoint": "localhost",
    "port": "9000",
    "useSSL": "false",
    "accessKey": "minioadmin",
    "secretKey": "minioadmin",
    "bucket": "simplens-attachments",
    "region": "us-east-1"
  }
}
```

#### Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Storage connection test successful!"
}
```

#### Error Response (`400 Bad Request`)
```json
{
  "success": false,
  "error": "Failed to connect to MinIO: connect ECONNREFUSED 127.0.0.1:9000"
}
```

---

### 4. List Configured Storage Providers
Retrieve all configured storage provider instances. Encrypted credentials are intentionally omitted from the response.

- **Method**: `GET`
- **Path**: `/api/storage`
- **Authentication**: Bearer / Session

#### Response Example (`200 OK`)
```json
{
  "providers": [
    {
      "_id": "6735c0ffee00000000000001",
      "name": "Local MinIO Storage",
      "provider_type": "minio",
      "enabled": true,
      "is_active": true,
      "created_at": "2026-11-14T10:00:00.000Z",
      "updated_at": "2026-11-14T10:00:00.000Z"
    }
  ]
}
```

---

### 5. Create Storage Provider
Register a new storage provider. Credentials are automatically encrypted before persistence.

- **Method**: `POST`
- **Path**: `/api/storage`
- **Authentication**: Bearer / Session

#### Request Body
```json
{
  "name": "Local MinIO Storage",
  "provider_type": "minio",
  "enabled": true,
  "is_active": true,
  "config": {
    "endPoint": "localhost",
    "port": "9000",
    "useSSL": "false",
    "accessKey": "minioadmin",
    "secretKey": "minioadmin",
    "bucket": "simplens-attachments",
    "region": "us-east-1"
  }
}
```

#### Response Example (`201 Created`)
```json
{
  "success": true,
  "provider": {
    "_id": "6735c0ffee00000000000001",
    "name": "Local MinIO Storage",
    "provider_type": "minio",
    "enabled": true,
    "is_active": true,
    "created_at": "2026-11-14T10:00:00.000Z"
  }
}
```

---

### 6. Update Storage Provider
Update an existing storage provider's name, enabled state, active flag, or credentials.

- **Method**: `PATCH`
- **Path**: `/api/storage/:id`
- **Authentication**: Bearer / Session

#### Request Body (Partial updates supported)
```json
{
  "name": "Production MinIO Cluster",
  "enabled": true,
  "config": {
    "endPoint": "localhost",
    "port": "9000",
    "useSSL": "false",
    "accessKey": "minioadmin",
    "secretKey": "minioadmin",
    "bucket": "simplens-attachments",
    "region": "us-east-1"
  }
}
```

#### Response Example (`200 OK`)
```json
{
  "success": true,
  "provider": {
    "_id": "6735c0ffee00000000000001",
    "name": "Production MinIO Cluster",
    "provider_type": "minio",
    "enabled": true,
    "is_active": true,
    "updated_at": "2026-11-14T10:15:00.000Z"
  }
}
```

---

### 7. Activate Storage Provider
Promote the specified provider as the single active storage provider. Automatically demotes all other configured providers.

- **Method**: `PATCH`
- **Path**: `/api/storage/:id/activate`
- **Authentication**: Bearer / Session

#### Response Example (`200 OK`)
```json
{
  "success": true,
  "provider": {
    "_id": "6735c0ffee00000000000001",
    "name": "Production MinIO Cluster",
    "provider_type": "minio",
    "enabled": true,
    "is_active": true
  }
}
```

---

### 8. Delete Storage Provider
Remove a configured storage provider record.

- **Method**: `DELETE`
- **Path**: `/api/storage/:id`
- **Authentication**: Bearer / Session

#### Response Example (`200 OK`)
```json
{
  "success": true,
  "message": "Storage provider deleted successfully"
}
```
