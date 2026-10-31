#!/usr/bin/env bash
set -e

CONTAINER="${1:-all}"
SKIP_BUILD=false

if [[ "$1" == "--skip-build" || "$2" == "--skip-build" ]]; then
    SKIP_BUILD=true
    if [[ "$1" == "--skip-build" ]]; then
        CONTAINER="${2:-all}"
    fi
fi

# 1. Dependency change safety check
if git status --porcelain package.json package-lock.json 2>/dev/null | grep -q 'package'; then
    echo "WARNING: Dependency files (package.json / package-lock.json) have been modified!"
    echo "Do NOT use hot-copy when dependencies have changed. An image rebuild is required:"
    echo "podman build --build-arg PORT=3000 --build-arg NODE_ENV=development -t simplens-core:local ."
    read -p "Are you sure you want to proceed without rebuilding the image? (y/N) " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        echo "Aborted."
        exit 1
    fi
fi

# 2. Build local TypeScript project
if [ "$SKIP_BUILD" = false ]; then
    echo "[1/3] Compiling TypeScript (npm run build)..."
    npm run build
else
    echo "[1/3] Skipping build step (--skip-build requested)..."
fi

if [ ! -d "dist" ]; then
    echo "Error: dist/ directory does not exist. Please run 'npm run build' first." >&2
    exit 1
fi

# 3. Identify target containers
echo "[2/3] Resolving target Podman containers..."
RUNNING_CONTAINERS=$(podman ps --filter "ancestor=simplens-core:local" --format "{{.Names}}" 2>/dev/null || true)

if [ -z "$RUNNING_CONTAINERS" ]; then
    RUNNING_CONTAINERS=$(podman ps --filter "name=simplens-.*-local" --format "{{.Names}}" 2>/dev/null | grep -v "simplens-dashboard-local" || true)
fi

if [ -z "$RUNNING_CONTAINERS" ]; then
    echo "Error: No running SimpleNS core containers found." >&2
    exit 1
fi

TARGETS=()
if [ "$CONTAINER" = "all" ] || [ -z "$CONTAINER" ]; then
    while IFS= read -r line; do
        [ -n "$line" ] && TARGETS+=("$line")
    done <<< "$RUNNING_CONTAINERS"
else
    while IFS= read -r line; do
        if [[ "$line" == *"$CONTAINER"* ]]; then
            TARGETS+=("$line")
        fi
    done <<< "$RUNNING_CONTAINERS"
    if [ ${#TARGETS[@]} -eq 0 ]; then
        echo "Error: Container matching '$CONTAINER' not found among running containers." >&2
        exit 1
    fi
fi

# 4. Copy dist/ and restart target containers
echo "[3/3] Copying compiled code and restarting containers..."
for target in "${TARGETS[@]}"; do
    echo "-> Updating $target..."
    podman cp dist/. "$target:/app/dist/"
    podman restart "$target" > /dev/null
    echo "   Successfully restarted $target"
done

echo ""
echo "All target containers updated successfully!"
