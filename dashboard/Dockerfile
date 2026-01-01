# ==========================================
# Stage 1: Install dependencies
# ==========================================
FROM node:20-alpine AS deps
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# ==========================================
# Stage 2: Build the application
# ==========================================
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the application with cache mount for Next.js
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# ==========================================
# Stage 3: Production runner
# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Create the .next/cache directory and set correct ownership
RUN mkdir -p .next/cache
RUN chown -R nextjs:nodejs .next

# Switch to non-root user
USER nextjs

ARG PORT

ENV PORT=${PORT}
ENV HOSTNAME="0.0.0.0"

# Expose the port
EXPOSE ${PORT} 

# Start the application (standalone mode - no npm/next needed)
CMD ["node", "server.js"]
