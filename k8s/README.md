# SimpleNS Kubernetes Setup Guide

Run SimpleNS in a local Kubernetes cluster (Docker Desktop or Kind) with testing environments for **Local builds**, **Master branch (Prod)**, and **Development branch**, all sharing a single infrastructure pod.

---

## 1. Quick Start in 4 Steps

### Step 0: Create the Kind Cluster (One-time Setup)
Ensure you have `kind` installed (`winget install Kubernetes.kind` or `choco install kind`), then create the cluster:
```powershell
kind create cluster --name simplens --config k8s/kind-config.yaml
```

---

### Step 1: Build Local Images
Build the Docker images for your local code:
```powershell
./k8s/scripts/win/build-local.ps1
```
> **Note:** The script automatically detects the running Kind cluster (from your kubectl context or Kind cluster list), loads `simplens-core:local` and `simplens-dashboard:local` into Kind, and prunes dangling `<none>:<none>` images to prevent duplicate image clutter in Docker Desktop.
> If you need a clean rebuild without Docker cache, pass `-NoCache`:
> ```powershell
> ./k8s/scripts/win/build-local.ps1 -NoCache
> ```

---

### Step 2: Deploy to Kubernetes
Deploy the shared infrastructure pod and start the local environment:
```powershell
./k8s/scripts/win/deploy-all.ps1 -ActiveEnv local
```
This script automatically:
- Creates the `simplens` namespace
- Injects your `.env` file as a Kubernetes Secret (`app-env`)
- Provisions persistent storage for Mongo, Kafka, Redis, and logs
- Starts the **Infra Pod** (Mongo, Kafka, Kafka-UI, Redis, Loki, Grafana)
- Starts the **Local App Pod** (API, Worker, Processor, Delayed Processor, Recovery, Dashboard)

---

### Step 3: Open Port Forwarding (Access in Browser)
In a separate terminal tab, start the port forwarder:
```powershell
./k8s/scripts/win/port-forward.ps1
```
*(The script automatically cleans up previous port-forward processes and avoids port conflicts with Kind NodePorts).*

Now open your browser:

| Service | Browser URL | Credentials / Notes |
| :--- | :--- | :--- |
| **SimpleNS Dashboard** | [http://localhost:3002](http://localhost:3002) *(or NodePort :30302)* | Admin web interface |
| **API Health Check** | [http://localhost:3000/api/health](http://localhost:3000/api/health) *(or NodePort :30300)* | Returns `{"status":"ok"}` |
| **Kafka UI** | [http://localhost:8080](http://localhost:8080) *(or NodePort :30080)* | Topic & message explorer |
| **Grafana** | [http://localhost:3001](http://localhost:3001) *(or NodePort :30001)* | User: `admin` / Password: `admin` |

*(Keep this terminal open while testing. Press `Ctrl + C` to stop port forwarding).*

---

## 2. Iterating on Local Code (Hot Rebuilding)

Whenever you make code changes and want to update the running local pod:
```powershell
./k8s/scripts/win/switch-env.ps1 -Env local -PullLatest
```
This single command will:
1. Rebuild the local Docker images from your current source code.
2. Load the updated images into your Kind cluster.
3. Clean up dangling images so duplicates don't accumulate.
4. Trigger a rolling restart of `app-local` and wait for the new pod rollout to complete before returning.

> **Tip:** If updating Dashboard UI components, do a hard refresh in the browser (`Ctrl + Shift + R` or `Ctrl + F5`) to bypass cached Next.js static bundles.

---

## 3. Helper Scripts Reference

All scripts live in `k8s/scripts/win/` and are designed to be simple:

### `build-local.ps1`
Builds `simplens-core:local` and `simplens-dashboard:local` from your current source code, loads them into Kind, and prunes dangling images.
```powershell
# Standard build:
./k8s/scripts/win/build-local.ps1

# Clean build without Docker cache:
./k8s/scripts/win/build-local.ps1 -NoCache

# Explicit cluster target if multiple exist:
./k8s/scripts/win/build-local.ps1 -ClusterName simplens
```

---

### `deploy-all.ps1`
Applies all manifests, sets up storage, reads `.env`, starts the infra pod, and brings up the chosen app environment.
```powershell
# Start with Local build active (default):
./k8s/scripts/win/deploy-all.ps1 -ActiveEnv local

# Or start with Master (Prod GHCR) active:
./k8s/scripts/win/deploy-all.ps1 -ActiveEnv master

# Or start with Development (GHCR) active:
./k8s/scripts/win/deploy-all.ps1 -ActiveEnv development
```

---

### `port-forward.ps1`
Tunnels ports from the Kubernetes cluster to your Windows machine (`localhost`). Automatically terminates stale `kubectl port-forward` processes and detects active NodePorts to prevent port collisions.
```powershell
# Forwards ports for ALL currently running environments + Kafka UI + Grafana:
./k8s/scripts/win/port-forward.ps1

# Or target only a specific environment:
./k8s/scripts/win/port-forward.ps1 -Env local
./k8s/scripts/win/port-forward.ps1 -Env master
./k8s/scripts/win/port-forward.ps1 -Env development
```

---

### `switch-env.ps1`
Switch which application environment is actively processing notifications. 
*(Because all 3 environments connect to the same shared Kafka queue, running one environment at a time prevents queue collisions)*:

```powershell
# Switch to Local build (uses existing build):
./k8s/scripts/win/switch-env.ps1 -Env local

# Rebuild local code, load into Kind, restart pod, and wait for readiness:
./k8s/scripts/win/switch-env.ps1 -Env local -PullLatest

# Rebuild without Docker cache:
./k8s/scripts/win/switch-env.ps1 -Env local -PullLatest -NoCache

# Switch to Development (uses cached image):
./k8s/scripts/win/switch-env.ps1 -Env development

# Pull latest image from GHCR on demand, then switch:
./k8s/scripts/win/switch-env.ps1 -Env development -PullLatest
./k8s/scripts/win/switch-env.ps1 -Env master -PullLatest

# Check current pod status:
./k8s/scripts/win/switch-env.ps1 -Env status
```

---

## 4. Port Allocations Reference

When running `./k8s/scripts/win/port-forward.ps1`, ports are mapped as follows:

| Environment | Dashboard | API | Description |
| :--- | :--- | :--- | :--- |
| **Local** | `http://localhost:30302` *(or :3002)* | `http://localhost:30300` *(or :3000)* | Your locally built code |
| **Master** | `http://localhost:30102` | `http://localhost:30100` | Latest release from `master` branch |
| **Development** | `http://localhost:30202` | `http://localhost:30200` | Latest build from `development` branch |
| **Kafka UI** | `http://localhost:8080` | — | Inspect Kafka topics & consumers |
| **Grafana** | [http://localhost:3001](http://localhost:3001) | — | Observability & Loki logs |

---

## 5. How Environment Variables Work (`.env`)

You do not need to manually copy environment variables into Kubernetes manifests:
1. `deploy-all.ps1` reads your root `.env` file (or `.env.example` as fallback).
2. It creates a Kubernetes Secret called `app-env` inside the `simplens` namespace.
3. Every container in the App Pod automatically imports these variables via `envFrom`.
4. Cluster-internal URLs (like `mongo:27017`, `kafka:9093`, `redis:6379`) and environment-specific database names (`simplens_local`, `simplens_master`, `simplens_development`) are automatically applied as overrides so each environment stays isolated.

---

## 6. Useful Debugging Commands

```powershell
# See all pods and their status:
kubectl get pods -n simplens

# View logs from a specific container:
kubectl logs -n simplens deploy/app-local -c api -f
kubectl logs -n simplens deploy/app-local -c worker -f
kubectl logs -n simplens deploy/app-local -c notification-processor -f
kubectl logs -n simplens deploy/simplens-infra -c mongo -f
kubectl logs -n simplens deploy/simplens-infra -c kafka -f

# Restart a deployment:
kubectl rollout restart deployment/app-local -n simplens
kubectl rollout restart deployment/simplens-infra -n simplens
```