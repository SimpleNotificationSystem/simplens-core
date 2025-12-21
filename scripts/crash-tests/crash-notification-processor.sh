#!/bin/bash
# Crash Test: Notification Processor (Unified)
# Simulates a notification processor crash and recovery
# The notification-processor uses the plugin system for all channels (mock, email, etc.)
# Usage: ./crash-notification-processor.sh [delay_seconds]

DELAY=${1:-30}  # Default 30 seconds delay before restart
CONTAINER="backend-notification-service-notification-processor-1"

echo "🔥 Crashing Notification Processor..."
docker kill $CONTAINER

echo "⏳ Waiting ${DELAY} seconds before restart..."
sleep $DELAY

echo "🔄 Restarting Notification Processor..."
docker compose up -d notification-processor

echo "✅ Notification Processor restarted. Check status with: docker compose ps"
