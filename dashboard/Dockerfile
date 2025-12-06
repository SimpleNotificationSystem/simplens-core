# ==========================================
# Stage 1: Install dependencies
# ==========================================
FROM node:20-alpine AS deps
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci --only=production=false

# ==========================================
# Stage 2: Build the application
# ==========================================
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG AUTH_SECRET
ARG ADMIN_USERNAME
ARG ADMIN_PASSWORD

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV AUTH_SECRET=${AUTH_SECRET}               
ENV ADMIN_USERNAME=${ADMIN_USERNAME}   
ENV ADMIN_PASSWORD=${ADMIN_PASSWORD} 

# Build the application
RUN npm run build

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

# Set correct permissions
USER nextjs

# Expose the port
EXPOSE 3002

ENV PORT=3002
ENV HOSTNAME="0.0.0.0"

# Start the application (standalone mode - no npm/next needed)
CMD ["node", "server.js"]
