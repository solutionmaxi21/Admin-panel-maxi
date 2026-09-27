# ============================================================
# MaxiStore Backend — Production Dockerfile
# Multi-stage build for Express + PostgreSQL (pg) API
# ============================================================

# ---- Stage 1: Install dependencies ----
FROM node:22.18.0-alpine AS deps

# Required for native modules (bcrypt, sharp)
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install ALL dependencies (need devDeps for any build steps)
RUN npm ci

# ---- Stage 2: Production image ----
FROM node:22.18.0-alpine AS runner

# Required at runtime for sharp image processing
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3001

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Copy production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source code
COPY server.js ./
COPY src/ ./src/
COPY routes/ ./routes/
COPY prisma/ ./prisma/

# Chaine de migrations SQL + runner. Necessaires pour que le service `schema`
# de docker-compose.yml puisse appliquer le schema depuis cette meme image,
# avant le demarrage de l'API.
COPY sql/ ./sql/
COPY scripts/ ./scripts/

# Copy entrypoint script
COPY docker-entrypoint.sh ./
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

# Create required directories with proper ownership
RUN mkdir -p logs uploads && \
    chown -R appuser:nodejs logs uploads

# Switch to non-root user
USER appuser

# Expose API port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://localhost:3001/api/health').then(r => { if (!r.ok) throw new Error(); process.exit(0); }).catch(() => process.exit(1));"

# Start with entrypoint script
ENTRYPOINT ["./docker-entrypoint.sh"]
