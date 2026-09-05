# SimpleNS Kubernetes Setup Guide

Run SimpleNS in a local Kubernetes cluster (Docker Desktop or Kind) with testing environments for **Local builds**, **Master branch (Prod)**, and **Development branch**, all sharing a single infrastructure pod.

---

## 1. Quick Start in 3 Steps

### Step 1: Build Local Images
Build the Docker images for your local code:
```powershell
./k8s/scripts/win/build-local.ps1
```
*(If you are using a Kind cluster named `simplens`, add `-LoadKind`: `./k8s/scripts/win/build-local.ps1 -LoadKind`)*

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

Now open your browser:

| Service | Browser URL | Credentials / Notes |
| :--- | :--- | :--- |
| **SimpleNS Dashboard** | [http://localhost:3002](http://localhost:3002) *(or :30302)* | Admin web interface |
| **API Health Check** | [http://localhost:3000/api/health](http://localhost:3000/api/health) | Returns `{"status":"ok"}` |
| **Kafka UI** | [http://localhost:8080](http://localhost:8080) | Topic & message explorer |
| **Grafana** | [http://localhost:3001](http://localhost:3001) | User: `admin` / Password: `admin` |

*(Keep this terminal open while testing. Press `Ctrl + C` to stop port forwarding).*

---

## 2. Helper Scripts Reference

All scripts live in `k8s/scripts/win/` and are designed to be simple:

### `build-local.ps1`
Builds `simplens-core:local` and `simplens-dashboard:local` from your current source code.
```powershell
./k8s/scripts/win/build-local.ps1
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
Tunnels ports from the Kubernetes cluster to your Windows machine (`localhost`).
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
# Switch to Local build:
./k8s/scripts/win/switch-env.ps1 -Env local

# Switch to Master (Prod GHCR image):
./k8s/scripts/win/switch-env.ps1 -Env master

# Switch to Development (GHCR image):
./k8s/scripts/win/switch-env.ps1 -Env development

# Check current pod status:
./k8s/scripts/win/switch-env.ps1 -Env status
```

---

## 3. Port Allocations Reference

When running `./k8s/scripts/win/port-forward.ps1`, ports are mapped as follows:

| Environment | Dashboard | API | Description |
| :--- | :--- | :--- | :--- |
| **Local** | `http://localhost:30302` *(or :3002)* | `http://localhost:30300` *(or :3000)* | Your locally built code |
| **Master** | `http://localhost:30102` | `http://localhost:30100` | Latest release from `master` branch |
| **Development** | `http://localhost:30202` | `http://localhost:30200` | Latest build from `development` branch |
| **Kafka UI** | `http://localhost:8080` | — | Inspect Kafka topics & consumers |
| **Grafana** | `http://localhost:3001` | — | Observability & Loki logs |

---

## 4. How Environment Variables Work (`.env`)

You do not need to manually copy environment variables into Kubernetes manifests:
1. `deploy-all.ps1` reads your root `.env` file (or `.env.example` as fallback).
2. It creates a Kubernetes Secret called `app-env` inside the `simplens` namespace.
3. Every container in the App Pod automatically imports these variables via `envFrom`.
4. Cluster-internal URLs (like `mongo:27017`, `kafka:9093`, `redis:6379`) and environment-specific database names (`simplens_local`, `simplens_master`, `simplens_development`) are automatically applied as overrides so each environment stays isolated.

---

## 5. Useful Debugging Commands

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