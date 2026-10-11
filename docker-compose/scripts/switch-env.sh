#!/usr/bin/env bash
# ==============================================================================
# SimpleNS Docker Compose Environment Switcher (Linux / macOS / WSL)
# Switches between 'local', 'dev', and 'master' environments.
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$COMPOSE_DIR/.." && pwd)"

INFRA_COMPOSE="$COMPOSE_DIR/docker-compose.infra.yaml"
LOCAL_COMPOSE="$COMPOSE_DIR/docker-compose.local.yaml"
DEV_COMPOSE="$COMPOSE_DIR/docker-compose.dev.yaml"
MASTER_COMPOSE="$COMPOSE_DIR/docker-compose.master.yaml"

ENV_FILE="$PROJECT_ROOT/.env"
if [ ! -f "$ENV_FILE" ]; then
  ENV_FILE="$PROJECT_ROOT/.env.example"
fi

ENV="${1:-status}"
REBUILD=false
NOCACHE=false
PULL_LATEST=false

# Parse flags
shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --rebuild|-r) REBUILD=true ;;
    --no-cache) NOCACHE=true; REBUILD=true ;;
    --pull|-p) PULL_LATEST=true ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
  shift
done

ensure_network() {
  if ! docker network inspect simplens-infra >/dev/null 2>&1; then
    echo "[Network] Creating 'simplens-infra' bridge network..."
    docker network create simplens-infra >/dev/null 2>&1 || true
  fi
}

ensure_infra_images() {
  echo "[Infra] Verifying infrastructure Docker images..."
  local images=(
    "mongo:7.0"
    "apache/kafka-native"
    "kafbat/kafka-ui:main"
    "redis:7-alpine"
    "grafana/loki:2.9.0"
    "grafana/grafana:10.2.0"
  )

  local missing_images=()
  for img in "${images[@]}"; do
    if ! docker image inspect "$img" >/dev/null 2>&1; then
      missing_images+=("$img")
    fi
  done

  if [ ${#missing_images[@]} -gt 0 ]; then
    echo "[Infra] Found ${#missing_images[@]} missing infrastructure image(s). Pulling..."
    for img in "${missing_images[@]}"; do
      echo "[Pull] Pulling '$img'..."
      docker pull "$img" || true
    done
    echo "[Infra] All required infrastructure images are downloaded."
  else
    echo "[Infra] All infrastructure images are present locally."
  fi
}

start_infra() {
  ensure_network
  ensure_infra_images
  echo "[Infra] Starting shared infrastructure services..."
  docker compose -p infra --env-file "$ENV_FILE" -f "$INFRA_COMPOSE" up -d
  echo "[Infra] Infrastructure services are up and healthy."
}

stop_app_environments() {
  local except="${1:-}"

  if [ "$except" != "local" ]; then
    local local_running
    local_running=$(docker ps -q --filter "label=simplens.environment=local" 2>/dev/null || true)
    if [ -n "$local_running" ]; then
      echo "[Stop] Stopping 'local' environment..."
      docker compose -p simplens-local --env-file "$ENV_FILE" -f "$LOCAL_COMPOSE" down 2>/dev/null || true
    fi
  fi

  if [ "$except" != "dev" ]; then
    local dev_running
    dev_running=$(docker ps -q --filter "label=simplens.environment=dev" 2>/dev/null || true)
    if [ -n "$dev_running" ]; then
      echo "[Stop] Stopping 'dev' environment..."
      docker compose -p simplens-dev --env-file "$ENV_FILE" -f "$DEV_COMPOSE" down 2>/dev/null || true
    fi
  fi

  if [ "$except" != "master" ]; then
    local master_running
    master_running=$(docker ps -q --filter "label=simplens.environment=master" 2>/dev/null || true)
    if [ -n "$master_running" ]; then
      echo "[Stop] Stopping 'master' environment..."
      docker compose -p simplens-master --env-file "$ENV_FILE" -f "$MASTER_COMPOSE" down 2>/dev/null || true
    fi
  fi
}

show_status() {
  echo ""
  echo "============================================================"
  echo "             SimpleNS Container Status                      "
  echo "============================================================"
  echo ""
  echo "--- Infrastructure Containers (shared: infra) ---"
  docker ps --filter "network=simplens-infra" --filter "name=simplens-infra" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
  echo ""
  echo "--- Active Application Containers ---"
  docker ps --filter "network=simplens-infra" --filter "label=simplens.environment" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
  echo ""
  echo "--- Service URLs ---"
  echo "  API Server:      http://localhost:3000/api/health"
  echo "  Dashboard:       http://localhost:3002"
  echo "  Kafka UI:        http://localhost:8081"
  echo "  Grafana:         http://localhost:3001  (User: admin / Pass: admin)"
  echo "============================================================"
  echo ""
}

case "$ENV" in
  local)
    start_infra
    stop_app_environments "local"
    if [ "$REBUILD" = true ]; then
      echo "[Build] Building local Docker images from source..."
      if [ "$NOCACHE" = true ]; then
        docker compose -p simplens-local --env-file "$ENV_FILE" -f "$LOCAL_COMPOSE" build --no-cache
      else
        docker compose -p simplens-local --env-file "$ENV_FILE" -f "$LOCAL_COMPOSE" build
      fi
    fi
    echo "[Start] Starting 'local' environment..."
    docker compose -p simplens-local --env-file "$ENV_FILE" -f "$LOCAL_COMPOSE" up -d
    echo "[OK] 'Local' environment is running!"
    show_status
    ;;

  dev)
    start_infra
    stop_app_environments "dev"
    if [ "$PULL_LATEST" = true ]; then
      echo "[Pull] Pulling latest development images from GHCR..."
      docker compose -p simplens-dev --env-file "$ENV_FILE" -f "$DEV_COMPOSE" pull
    fi
    echo "[Start] Starting 'dev' environment..."
    docker compose -p simplens-dev --env-file "$ENV_FILE" -f "$DEV_COMPOSE" up -d
    echo "[OK] 'Dev' environment is running!"
    show_status
    ;;

  master)
    start_infra
    stop_app_environments "master"
    if [ "$PULL_LATEST" = true ]; then
      echo "[Pull] Pulling latest master images from GHCR..."
      docker compose -p simplens-master --env-file "$ENV_FILE" -f "$MASTER_COMPOSE" pull
    fi
    echo "[Start] Starting 'master' environment..."
    docker compose -p simplens-master --env-file "$ENV_FILE" -f "$MASTER_COMPOSE" up -d
    echo "[OK] 'Master' environment is running!"
    show_status
    ;;

  status)
    show_status
    ;;

  down)
    echo "[Down] Stopping all active application environments..."
    stop_app_environments ""
    echo "[OK] All application containers stopped. Infrastructure remains active."
    ;;

  infra-only)
    stop_app_environments ""
    start_infra
    echo "[OK] Infrastructure services are running."
    ;;

  infra-down)
    echo "[Infra-Down] Stopping all applications and shared infrastructure..."
    stop_app_environments ""
    docker compose -p infra --env-file "$ENV_FILE" -f "$INFRA_COMPOSE" down
    echo "[OK] All SimpleNS containers stopped."
    ;;

  *)
    echo "Usage: $0 {local|dev|master|status|down|infra-only|infra-down} [--rebuild] [--no-cache] [--pull]"
    exit 1
    ;;
esac
