#!/bin/bash
# Crash Test: All Processors
# Simulates a complete processor infrastructure crash
# Usage: ./crash-all-processors.sh [delay_seconds]

DELAY=${1:-60}  # Default 60 seconds delay before restart

echo "🔥 Crashing ALL Processors..."
docker kill backend-notification-service-notification-processor-1 2>/dev/null
docker kill backend-notification-service-delayed-processor-1 2>/dev/null

echo "💀 All processors are down!"
echo "⏳ Waiting ${DELAY} seconds before restart..."
sleep $DELAY

echo "🔄 Restarting all processors..."
docker compose up -d notification-processor delayed-processor

echo "✅ All processors restarted. Check status with: docker compose ps"
