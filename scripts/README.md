# SimpleNS Testing & Utility Scripts

This directory contains developer utilities for testing, load generation, webhook verification, and resilience/chaos testing for SimpleNS.

```
scripts/
├── client.js                   # Lightweight Express webhook receiver for callback inspection
├── load-test.js                # Universal notification sender & high-concurrency load tester
├── crash-tests/
│   ├── k8s-chaos.ps1           # Kubernetes-native container & pod chaos testing
│   └── crash-multiwave-all.sh  # Docker Compose infrastructure chaos testing (8 waves)
└── README.md                   # This documentation
```

---

## 1. Webhook Test Receiver (`client.js`)

A lightweight Express server that listens for delivery and failure webhook callbacks sent by SimpleNS workers. It tracks delivery stats, duplicate callbacks, and channel breakdowns in memory.

### Features
- Receives `POST /webhook` status updates (`DELIVERED`, `FAILED`).
- Detects and counts duplicate webhook deliveries.
- Provides real-time stats and channel breakdown via `GET /stats`.
- Provides a `POST /reset` endpoint to wipe stats between test runs.

### Usage

```powershell
# Start on default port 4000:
node scripts/client.js

# Start on custom port:
node scripts/client.js --port 5000
```

### Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/webhook` | Receives delivery status callbacks from SimpleNS |
| `GET` | `/health` | Health check (`{"status":"ok"}`) |
| `GET` | `/stats` | View total received, delivered, failed, duplicates, and channel stats |
| `POST` / `GET` | `/reset` | Clear all recorded webhooks to start a fresh test |

### Webhook URL to Use in Notifications

- **When SimpleNS runs locally on host (`npm run dev`):**  
  `http://localhost:4000/webhook`
- **When SimpleNS runs inside Docker or Kubernetes (Kind):**  
  `http://host.docker.internal:4000/webhook`

---

## 2. Universal Notification Client & Load Tester (`load-test.js`)

An `axios`-based notification client with connection pooling (`http.Agent` keep-alive) supporting single sends, template sends, scheduled/delayed sends, and high-concurrency load testing.

### Options Reference

| Flag | Long Flag | Description | Default |
|---|---|---|---|
| `-n` | `--requests` | Total requests to send | `1` |
| `-c` | `--concurrency` | Number of concurrent requests per batch | `1` |
| `-ch` | `--channels` | Comma-separated channel list | `mock` |
| `-p` | `--providers` | Comma-separated provider IDs | (none) |
| `-to` | `--to` | Recipient user ID, email, or phone | `test@example.com` |
| `-s` | `--subject` | Subject line (email) | `Test Notification` |
| `-m` | `--message` | Message body content | (sample message) |
| `-t` | `--template` | Template ID | (none) |
| `-v` | `--variables` | Template variables as JSON string | (none) |
| `-d` | `--delay` | Delay in seconds (`scheduled_at`) | `0` |
| `-u` | `--url` | Base API URL | `http://localhost:3000` |
| `-k` | `--key` | SimpleNS API key | (from `.env`) |
| `-h` | `--host` | Webhook host type (`local` or `docker`) | `local` |
| `-w` | `--webhook` | Explicit custom webhook URL override | (none) |
| | `--help` | Display options help | |

### Sample Commands

#### Single Send (Mock Channel)
```powershell
# Send a mock notification (instant simulated delivery):
node scripts/load-test.js -ch mock -p mock -m "Test notification from CLI"
```

#### Single Send to Kubernetes (Kind Cluster)
```powershell
# Send to Kind NodePort (30300) with webhook forwarded to host:
node scripts/load-test.js -u http://localhost:30300 -ch mock -p mock -m "Hello Kind" -h docker

# Send via port-forward tunnel (3000):
node scripts/load-test.js -u http://localhost:3000 -ch mock -p mock -m "Hello Kind" -h docker
```

#### Email Send
```powershell
node scripts/load-test.js -ch email --to recipient@example.com -s "Monthly Report" -m "Your report is ready."
```

#### Template Send with Variables
```powershell
node scripts/load-test.js -t welcome_template -v '{"userName":"Alex","plan":"Pro"}'
```

#### Scheduled / Delayed Notification
```powershell
# Schedule delivery 60 seconds into the future:
node scripts/load-test.js -ch mock -p mock -d 60 -m "Delayed reminder" -h docker
```

#### High-Concurrency Load Test
```powershell
# Send 1,000 requests with concurrency of 50:
node scripts/load-test.js -n 1000 -c 50 -ch mock -p mock -h docker
```
*Reports throughput (req/sec), min/avg/max latency, `p50`, `p95`, `p99` percentiles, and HTTP status code distributions.*

---

## 3. Chaos & Resilience Testing (`crash-tests/`)

Simulate service crashes, database outages, connection drops, and container evictions under active load to verify outbox recovery and idempotency.

### A. Kubernetes Native Chaos (`k8s-chaos.ps1`)

Designed specifically for Kubernetes clusters (Kind or Docker Desktop) running the `app-local` and `simplens-infra` pods.

Instead of crashing Docker directly, it:
1. Generates active background notification traffic using `load-test.js`.
2. Kills specific container processes inside pods via `kubectl exec ... kill 1`.
3. Evicts whole pods via `kubectl delete pod --now`.
4. Disrupts infrastructure (Redis, Kafka) inside the infra pod.
5. Verifies self-healing and outbox recovery.

#### Usage

```powershell
# Run all 4 chaos waves with 300 requests:
./scripts/crash-tests/k8s-chaos.ps1

# Custom request volume:
./scripts/crash-tests/k8s-chaos.ps1 -Requests 500

# Target a specific wave:
./scripts/crash-tests/k8s-chaos.ps1 -Wave app       # Individual container kills (worker, processor, delayed)
./scripts/crash-tests/k8s-chaos.ps1 -Wave infra     # Redis & Kafka disruptions
./scripts/crash-tests/k8s-chaos.ps1 -Wave pod       # Full app-local pod eviction
./scripts/crash-tests/k8s-chaos.ps1 -Wave cascade   # Simultaneous app + infra collapse
```

---

### B. Docker Compose Chaos (`crash-multiwave-all.sh`)

Designed for environments running directly via `docker compose -f docker-compose.dev.yaml up -d`.

Simulates 8 distinct disaster waves:
1. **Sustained Load Crash**: Sequential app + Redis kills under heavy load.
2. **Rapid Restart Chaos**: 5 quick crash-restart cycles testing connection pools.
3. **Split Brain Attack**: Partial service availability testing orphan recovery.
4. **Total Blackout**: Complete simultaneous death of app + infra services.
5. **Rolling Chaos**: Continuous random service kills over 60 seconds.
6. **Infrastructure Chaos**: Targeted Redis, Kafka, and MongoDB crashes.
7. **Database Partition**: MongoDB replica crashes during active transactions.
8. **Complete Apocalypse**: Everything killed at once, random recovery race.

#### Usage (Git Bash / Linux / macOS)

```bash
cd scripts/crash-tests

# Run all 8 waves with 500 requests per wave and 30s pause:
./crash-multiwave-all.sh 500 30
```

---

## 4. End-to-End Verification Workflow

To test the entire system end-to-end against a running cluster:

### Step 1: Start the Webhook Server
In Terminal 1:
```powershell
node scripts/client.js
```

### Step 2: Ensure Port Forwarding or NodePorts are Active
In Terminal 2:
```powershell
./k8s/scripts/win/port-forward.ps1
```
*(Or use direct Kind NodePorts `http://localhost:30300` for API and `http://localhost:30302` for Dashboard).*

### Step 3: Run the Chaos Test
In Terminal 3:
```powershell
./scripts/crash-tests/k8s-chaos.ps1 -Requests 300
```

### Step 4: Verify Delivery
- In Terminal 1, watch the incoming webhook deliveries logged.
- Check stats: `curl http://localhost:4000/stats`
- Check Dashboard Alerts: [http://localhost:3002](http://localhost:3002)
- Check Recovery Service Logs:
  ```powershell
  kubectl logs -n simplens deploy/app-local -c recovery -f
  ```

