#!/bin/bash
# Crash Test: Cascading Failure
# Simulates services failing one after another with intervals
# Usage: ./crash-cascading.sh

echo "🌊 Starting Cascading Failure Simulation..."
echo ""

echo "Stage 1: Killing Email Processor..."
docker kill backend-notification-service-email-processor-1 2>/dev/null
echo "⏳ Waiting 10 seconds..."
sleep 10

echo "Stage 2: Killing WhatsApp Processor..."
docker kill backend-notification-service-whatsapp-processor-1 2>/dev/null
echo "⏳ Waiting 10 seconds..."
sleep 10

echo "Stage 3: Killing Background Worker..."
docker kill backend-notification-service-worker-1 2>/dev/null
echo "⏳ Waiting 10 seconds..."
sleep 10

echo "Stage 4: Killing Delayed Processor..."
docker kill backend-notification-service-delayed-processor-1 2>/dev/null

echo ""
echo "💀 Cascading failure complete - all services down!"
echo ""
echo "⏳ Waiting 60 seconds before recovery..."
sleep 60

echo ""
echo "🔄 Starting cascading recovery..."

echo "Stage 1: Restarting Worker..."
docker compose up -d worker
sleep 5

echo "Stage 2: Restarting Email Processor..."
docker compose up -d email-processor
sleep 5

echo "Stage 3: Restarting WhatsApp Processor..."
docker compose up -d whatsapp-processor
sleep 5

echo "Stage 4: Restarting Delayed Processor..."
docker compose up -d delayed-processor

echo ""
echo "✅ All services restored. Check status with: docker compose ps"
