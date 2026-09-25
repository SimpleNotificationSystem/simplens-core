# SimpleNS Multi-Environment Docker Compose Setup

Run and test SimpleNS across three distinct environments (**Local**, **Development**, and **Master**) powered by a shared, persistent infrastructure stack.

---

## 1. Quick Overview

Instead of maintaining separate Kubernetes clusters or pods for routine branch testing, all environment switching is handled cleanly via Docker Compose:

```
docker-compose/
├── docker-compose.infra.yaml    # Shared base infrastructure (Mongo, Kafka, Redis, Loki, Grafana)
├── docker-compose.local.yaml    # Application stack built from local source code
├── docker-compose.dev.yaml      # Application stack using GHCR 'development' branch images
├── docker-compose.master.yaml   # Application stack using GHCR 'latest' (master) release images
├── scripts/
│   ├── switch-env.ps1           # Windows PowerShell switcher
│   └── switch-env.sh            # Linux / macOS Bash switcher
└── README.md
```

### Key Highlights
- **Shared Infrastructure**: MongoDB replica set (`rs0`), Apache Kafka (KRaft), Redis, Loki, and Grafana run once and persist.
- **Zero Port Collisions**: All three environments use standard ports (`API: 3000`, `Dashboard: 3002`). The switching scripts cleanly terminate the previous environment before bringing up the new one.
- **Database Isolation**:
  - `local` environment connects to `simplens_local`
  - `dev` environment connects to `simplens_dev`
  - `master` environment connects to `simplens_master`

---

## 2. Usage & Switching Commands

Use the unified switcher script from PowerShell (Windows) or Bash (Linux / macOS):

### Windows (PowerShell)

```powershell
# 1. Run Local source build (builds images from current working directory)
./docker-compose/scripts/switch-env.ps1 -Env local -Rebuild

# 2. Run Development branch (pulls latest GHCR development image)
./docker-compose/scripts/switch-env.ps1 -Env dev -PullLatest

# 3. Run Master branch (pulls latest GHCR master release)
./docker-compose/scripts/switch-env.ps1 -Env master -PullLatest

# 4. Check active containers & service URLs
./docker-compose/scripts/switch-env.ps1 -Env status

# 5. Stop application containers (keeps infrastructure running)
./docker-compose/scripts/switch-env.ps1 -Env down

# 6. Stop everything (including infrastructure)
./docker-compose/scripts/switch-env.ps1 -Env infra-down
```

### Linux / macOS (Bash)

```bash
# Make script executable
chmod +x ./docker-compose/scripts/switch-env.sh

# 1. Run Local source build
./docker-compose/scripts/switch-env.sh local --rebuild

# 2. Run Development branch
./docker-compose/scripts/switch-env.sh dev --pull

# 3. Run Master branch
./docker-compose/scripts/switch-env.sh master --pull

# 4. Check status
./docker-compose/scripts/switch-env.sh status

# 5. Stop applications
./docker-compose/scripts/switch-env.sh down

# 6. Stop everything
./docker-compose/scripts/switch-env.sh infra-down
```

---

## 3. Port & Service Directory

When the stack is running, all services are accessible on your host machine:

| Service | Host URL | Description / Credentials |
| :--- | :--- | :--- |
| **SimpleNS API** | [http://localhost:3000](http://localhost:3000) | Health endpoint: `/api/health` |
| **SimpleNS Dashboard** | [http://localhost:3002](http://localhost:3002) | Next.js admin management console |
| **Kafka UI** | [http://localhost:8081](http://localhost:8081) | Topic partitions, consumer groups, and lag |
| **Grafana** | [http://localhost:3001](http://localhost:3001) | User: `admin` / Password: `admin` |
| **MongoDB** | `mongodb://localhost:27017` | Direct database connection (`rs0`) |
| **Redis** | `redis://localhost:6379` | Direct Redis connection |

---

## 4. Environment Comparison

| Attribute | `local` | `dev` | `master` |
| :--- | :--- | :--- | :--- |
| **Image Source** | Local Dockerfile build | `ghcr.io/.../simplens-core:development` | `ghcr.io/.../simplens-core:latest` |
| **Database** | `simplens_local` | `simplens_dev` | `simplens_master` |
| **Use Case** | Active code development & testing | Testing pre-release features | Testing production-equivalent baseline |
| **Rebuild Flag** | `-Rebuild` / `--rebuild` | N/A | N/A |
| **Pull Flag** | N/A | `-PullLatest` / `--pull` | `-PullLatest` / `--pull` |

---

## 5. Troubleshooting & FAQ

### Port already in use (e.g. 3000 or 3002)?
Run `./docker-compose/scripts/switch-env.ps1 -Env down` to shut down any lingering application containers. If an old root Docker Compose is running, stop it via `docker compose down`.

### Resetting all data?
To completely reset all databases and queues:
```powershell
./docker-compose/scripts/switch-env.ps1 -Env infra-down
docker volume prune -f
```
