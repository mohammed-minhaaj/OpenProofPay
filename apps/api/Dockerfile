# ==============================================================================
# OPENPROOFPAY — API SERVICE DOCKERFILE
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy root monorepo config
COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/api/package*.json ./apps/api/

# Install all dependencies
RUN npm ci

# Copy source trees
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

# Build shared library and API
RUN npm run build --workspace=@openproofpay/shared
RUN npm run build --workspace=@openproofpay/api

# ------------------------------------------------------------------------------
# Production Image
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Install curl for container health check
RUN apk add --no-cache curl

# Copy root manifest and built artifacts
COPY package*.json ./
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package*.json ./packages/shared/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package*.json ./apps/api/
COPY --from=builder /app/node_modules ./node_modules

# Non-root secure execution
USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

CMD ["node", "apps/api/dist/server.js"]
