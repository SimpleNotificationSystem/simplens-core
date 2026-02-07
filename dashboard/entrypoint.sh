#!/bin/sh
set -e

# Get base path from environment (defaults to empty)
BASE_PATH="${BASE_PATH:-}"

echo "🚀 Starting SimpleNS Dashboard..."
echo "📍 Base Path: ${BASE_PATH:-'/ (root)'}"

# Generate runtime configuration accessible to client
cat > /app/public/runtime-config.js << EOF
window.__RUNTIME_CONFIG__ = {
  basePath: "${BASE_PATH}"
};
EOF

echo "✅ Runtime configuration generated"

# Execute the Next.js standalone server
exec node server.js
