# ============================================
# Multi-Stage Build for Ultra-Lean Production Image
# Final image size: ~150MB (vs 400MB+ unoptimized)
# Runtime: Native JS (no tsx overhead)
# ============================================

# ============================================
# STAGE 1: Dependencies - Cached Layer
# ============================================
FROM node:20-alpine AS deps

WORKDIR /app

# Copy only dependency files for better caching
COPY package*.json ./

# Install dependencies (will be cached unless package.json changes)
RUN npm ci --include=dev

# ============================================
# STAGE 2: Builder - Compile & Generate
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source and config files
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY src ./src
COPY public ./public

# Generate Prisma Client
RUN npx prisma generate

# Compile TypeScript to JavaScript (removes tsx runtime overhead)
RUN npx tsc

# ============================================
# STAGE 3: Test - Quality Gate
# ============================================
FROM builder AS test

# Copy test files and configuration
COPY __tests__ ./__tests__
COPY vitest.config.ts ./
COPY .env.test ./

# Run tests (build will fail if tests fail)
RUN npm run test:ci

# ============================================
# STAGE 4: Production Runtime - Ultra Lean
# (Only built if tests pass)
# ============================================
FROM node:20-alpine AS production

# Copy test results to ensure test stage runs
# (Docker won't build this stage unless test stage succeeds)
COPY --from=test /app/dist ./test-passed

# Install dumb-init for proper signal handling (PID 1 problem)
RUN apk add --no-cache dumb-init

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./

# Install build dependencies, production deps (including native modules), then clean up
# This compiles better-sqlite3 and other native modules
RUN apk add --no-cache --virtual .build-deps \
    python3 \
    make \
    g++ && \
    npm ci --omit=dev && \
    npm cache clean --force && \
    apk del .build-deps

# Copy compiled JavaScript from builder
COPY --from=builder /app/dist ./dist

# Copy Prisma files (needed for db push at runtime)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma.config.ts ./

# Copy static assets
COPY --from=builder /app/public ./public

# Create data directory and set ownership
RUN mkdir -p /app/data && \
    chown -R nodejs:nodejs /app

# Switch to non-root user (security best practice)
USER nodejs

# Expose application port
EXPOSE 3000

# Add health check for container orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/config', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Set environment to production
ENV NODE_ENV=production

# Use dumb-init to handle signals properly (graceful shutdown)
ENTRYPOINT ["dumb-init", "--"]

# Run database migration then start app
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/server.js"]
