# Podman Container Hot-Sync Architecture & Troubleshooting

## How It Works

1. **Compilation**: `npm run build` compiles TypeScript files in `src/` to JavaScript in `dist/` and resolves path aliases via `tsc-alias`.
2. **Container File Injection**: `podman cp dist/. <container>:/app/dist/` copies compiled artifacts directly into the container's working directory `/app/dist/` with proper permissions (`nodejs:nodejs`).
3. **Process Restart**: Node processes started as `node dist/api/server.js` or `node dist/workers/...` run in-memory and do not automatically watch for file modifications in production-like containers. Calling `podman restart <container>` re-launches the Node process with the updated code within 1–2 seconds.

---

## SimpleNS Core Container Reference

The following services run off the `simplens-core:local` image in `docker-compose/docker-compose.local.yaml`:

| Service Key in Compose | Container Name | Target Script / Entrypoint |
| :--- | :--- | :--- |
| `api` | `simplens-api-local` | `node dist/api/server.js` |
| `worker` | `simplens-worker-local` | `node dist/workers/worker.js` |
| `notification_processor` | `simplens-notification-processor-local` | `node dist/processors/unified/unified.processor.js` |
| `delayed_processor` | `simplens-delayed-processor-local` | `node dist/processors/delayed/delayed.processor.js` |
| `recovery` | `simplens-recovery-local` | `node dist/workers/recovery/recovery.service.js` |

*(Note: `simplens-dashboard-local` uses a separate image `simplens-dashboard:local` and Next.js frontend code).*

---

## When Hot-Sync CANNOT Be Used

Do **NOT** use hot-sync when:
- New npm packages were added (`package.json` or `package-lock.json` updated).
- Native dependencies or OS-level packages changed.
- Container environment variables or Dockerfile directives were changed.

In those cases, perform a full image rebuild:
```powershell
podman build --build-arg PORT=3000 --build-arg NODE_ENV=development -t simplens-core:local .
podman-compose -f docker-compose/docker-compose.local.yaml up -d
```

---

## Troubleshooting

### Container Fails to Start After Restart
Inspect logs:
```powershell
podman logs --tail 50 <container_name>
```

### Check File Timestamp Inside Container
```powershell
podman exec <container_name> ls -la /app/dist/api/server.js
```
