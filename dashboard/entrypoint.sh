#!/bin/sh
set -e

# Get configuration from environment
BASE_PATH="${BASE_PATH:-}"
WEBHOOK_HOST="${WEBHOOK_HOST:-localhost}"
WEBHOOK_PORT="${WEBHOOK_PORT:-3002}"

echo "🚀 Starting SimpleNS Dashboard..."
echo "📍 Base Path: ${BASE_PATH:-'/ (root)'}"
echo "📍 Webhook Host: ${WEBHOOK_HOST}"
echo "📍 Webhook Port: ${WEBHOOK_PORT}"

# Generate runtime configuration accessible to client
cat > /app/public/runtime-config.js << EOF
window.__RUNTIME_CONFIG__ = {
  basePath: "${BASE_PATH}",
  webhookHost: "${WEBHOOK_HOST}",
  webhookPort: "${WEBHOOK_PORT}"
};
EOF

echo "✅ Runtime configuration generated"

# Execute the Next.js standalone server
exec node server.js
