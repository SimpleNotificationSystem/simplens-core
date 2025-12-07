# Multi-stage build for Node.js TypeScript application
# Supports multiple services: api, worker, email-processor, whatsapp-processor, delayed-processor

# ============================================
# Stage 1: Build
# ============================================
FROM node:22-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code and TypeScript config
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# ============================================
# Stage 2: Production
# ============================================
FROM node:22-slim AS production

WORKDIR /app

# Create non-root user for security (Debian syntax for slim image)
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/sh --create-home nodejs

# Copy package files
COPY package*.json ./

# Install only production dependencies (ignore scripts to prevent husky from running)
RUN npm ci --only=production --ignore-scripts && npm cache clean --force

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Set ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

ARG NODE_ENV
ARG PORT
# Default environment variables
ENV NODE_ENV=${NODE_ENV}
ENV PORT=${PORT}

# Expose port (only used by API)
EXPOSE ${PORT}

# Default command (can be overridden in docker-compose)
CMD ["node", "dist/api/server.js"]
