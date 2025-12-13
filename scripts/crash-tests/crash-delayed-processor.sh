#!/bin/bash
# Crash Test: Delayed Processor
# Simulates a delayed processor crash and recovery
# Usage: ./crash-delayed-processor.sh [delay_seconds]

DELAY=${1:-30}  # Default 30 seconds delay before restart
CONTAINER="backend-notification-service-delayed-processor-1"

echo "🔥 Crashing Delayed Processor..."
docker kill $CONTAINER

echo "⏳ Waiting ${DELAY} seconds before restart..."
sleep $DELAY

echo "🔄 Restarting Delayed Processor..."
docker compose up -d delayed-processor

echo "✅ Delayed Processor restarted. Check status with: docker compose ps"
