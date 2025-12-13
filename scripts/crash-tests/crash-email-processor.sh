#!/bin/bash
# Crash Test: Email Processor
# Simulates an email processor crash and recovery
# Usage: ./crash-email-processor.sh [delay_seconds]

DELAY=${1:-30}  # Default 30 seconds delay before restart
CONTAINER="backend-notification-service-email-processor-1"

echo "🔥 Crashing Email Processor..."
docker kill $CONTAINER

echo "⏳ Waiting ${DELAY} seconds before restart..."
sleep $DELAY

echo "🔄 Restarting Email Processor..."
docker compose up -d email-processor

echo "✅ Email Processor restarted. Check status with: docker compose ps"
