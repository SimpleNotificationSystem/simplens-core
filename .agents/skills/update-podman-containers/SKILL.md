---
name: update-podman-containers
description: >-
  Builds the project and hot-updates running Podman container(s) with new compiled code without rebuilding the entire image.
  Use this skill ONLY when code changes are made. Do NOT use this skill if dependencies were added or package.json was modified; in that case a full image rebuild is required.
---

# Update Podman Containers (Hot Code Sync)

This skill allows you to compile local TypeScript changes and sync them into running SimpleNS Podman container(s) without undergoing a full image rebuild.

> [!WARNING] Dependency Boundary
> Use this skill **only for application code changes** (in `src/`, `config/`, etc.).
> If `package.json` or `package-lock.json` were modified or new npm packages were added, **do not use this skill**. An image rebuild is required:
> ```powershell
> podman build --build-arg PORT=3000 --build-arg NODE_ENV=development -t simplens-core:local .
> podman-compose -f docker-compose/docker-compose.local.yaml up -d
> ```

---

## Quick Execution

You can run the bundled helper script to handle compilation, copying, and container restarting automatically:

### On Windows (PowerShell):
```powershell
# Update all running SimpleNS core containers
.\.agents\skills\update-podman-containers\scripts\update-containers.ps1

# Or update only a specific container (e.g. api or worker)
.\.agents\skills\update-podman-containers\scripts\update-containers.ps1 -Container api
```

### On Linux / WSL:
```bash
./.agents/skills/update-podman-containers/scripts/update-containers.sh
```

---

## Step-by-Step Manual Workflow

If you prefer to execute the steps individually:

### Step 1: Verify Dependencies Have Not Changed
Check if `package.json` or `package-lock.json` are modified:
```powershell
git status --porcelain package.json package-lock.json
```
If there are changes to dependencies, stop here and perform a full image rebuild instead.

### Step 2: Build the TypeScript Code
Compile `src/` to `dist/` with alias resolution:
```powershell
npm run build
```
Verify that the `dist/` folder was generated without compilation errors.

### Step 3: Identify Target Running Containers
List running SimpleNS core containers:
```powershell
podman ps --filter "ancestor=simplens-core:local" --format "{{.Names}}"
```
Typical core containers include:
- `simplens-api-local`
- `simplens-worker-local`
- `simplens-notification-processor-local`
- `simplens-delayed-processor-local`
- `simplens-recovery-local`

### Step 4: Copy Compiled Artifacts to Container
Copy the fresh `dist/` directory into `/app/dist/` inside the target container(s):
```powershell
# Example for API container:
podman cp dist/. simplens-api-local:/app/dist/

# Example for Worker container:
podman cp dist/. simplens-worker-local:/app/dist/
```

### Step 5: Restart the Container(s)
Restart the container so the Node.js process picks up the newly copied files:
```powershell
podman restart simplens-api-local
```

### Step 6: Verify Startup Logs
Check the recent logs to confirm the service restarted cleanly:
```powershell
podman logs --tail 20 simplens-api-local
```

---

## In-Depth Documentation

For details on architecture, service mappings, and troubleshooting, consult [references/workflow.md](./references/workflow.md).
