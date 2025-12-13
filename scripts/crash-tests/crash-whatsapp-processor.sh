#!/bin/bash
# Crash Test: WhatsApp Processor
# Simulates a WhatsApp processor crash and recovery
# Usage: ./crash-whatsapp-processor.sh [delay_seconds]

DELAY=${1:-30}  # Default 30 seconds delay before restart
CONTAINER="backend-notification-service-whatsapp-processor-1"

echo "🔥 Crashing WhatsApp Processor..."
docker kill $CONTAINER

echo "⏳ Waiting ${DELAY} seconds before restart..."
sleep $DELAY

echo "🔄 Restarting WhatsApp Processor..."
docker compose up -d whatsapp-processor

echo "✅ WhatsApp Processor restarted. Check status with: docker compose ps"
