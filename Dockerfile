
# Multi-stage build for Node.js TypeScript application
# Supports: api, worker, unified-processor, delayed-processor, recovery

# ============================================
# Stage 1: Build
# ============================================
FROM node:22-alpine AS builder

WORKDIR /app

ENV HUSKY=0

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies)
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Copy source code and TypeScript configuration
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build


# ============================================
# Stage 2: Production
# ============================================
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV HUSKY=0

# Create non-root user and group
RUN addgroup -S -g 1001 nodejs && \
    adduser -S -u 1001 -G nodejs nodejs

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts

# Copy compiled application from builder
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Create plugins directory with read/write permissions
RUN mkdir -p /app/.plugins && \
    chown nodejs:nodejs /app/.plugins && \
    chmod 755 /app/.plugins

# Set ownership of application directory
RUN chown nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Runtime configuration
ARG PORT=3000
ENV PORT=${PORT}

# Expose application port
EXPOSE ${PORT}

# Default command (override through docker-compose)
CMD ["node", "dist/api/server.js"]
