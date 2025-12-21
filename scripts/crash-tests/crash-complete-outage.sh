#!/bin/bash
# Crash Test: Complete Outage (Worker + All Processors)
# Simulates a total notification processing infrastructure failure
# Usage: ./crash-complete-outage.sh [delay_seconds]

DELAY=${1:-120}  # Default 2 minutes delay before restart

echo "🔥🔥🔥 SIMULATING COMPLETE OUTAGE 🔥🔥🔥"
echo ""

echo "Killing Worker..."
docker kill backend-notification-service-worker-1 2>/dev/null

echo "Killing Notification Processor..."
docker kill backend-notification-service-notification-processor-1 2>/dev/null

echo "Killing Delayed Processor..."
docker kill backend-notification-service-delayed-processor-1 2>/dev/null

echo ""
echo "💀💀💀 COMPLETE OUTAGE - All processing services are DOWN! 💀💀💀"
echo ""
echo "The API is still running - notifications will be accepted but not processed."
echo ""
echo "⏳ Waiting ${DELAY} seconds before restart..."
echo "   Check dashboard: http://localhost:3002"
sleep $DELAY

echo ""
echo "🔄 Restoring all services..."
docker compose up -d worker notification-processor delayed-processor

echo ""
echo "✅ All services restored. Check status with: docker compose ps"
