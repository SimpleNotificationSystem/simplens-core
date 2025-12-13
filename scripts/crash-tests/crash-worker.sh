#!/bin/bash
# Crash Test: Background Worker
# Simulates a background worker crash and recovery
# Usage: ./crash-worker.sh [delay_seconds]

DELAY=${1:-30}  # Default 30 seconds delay before restart
CONTAINER="backend-notification-service-worker-1"

echo "🔥 Crashing Background Worker..."
docker kill $CONTAINER

echo "⏳ Waiting ${DELAY} seconds before restart..."
sleep $DELAY

echo "🔄 Restarting Background Worker..."
docker compose up -d worker

echo "✅ Background Worker restarted. Check status with: docker compose ps"
