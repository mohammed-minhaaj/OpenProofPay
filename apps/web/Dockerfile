# ==============================================================================
# OPENPROOFPAY — WEB DASHBOARD DOCKERFILE
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root monorepo config
COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/web/package*.json ./apps/web/

RUN npm ci

# Copy source trees
COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/

# Accept build-time API URL
ARG VITE_API_URL=http://localhost:5000/api/v1
ENV VITE_API_URL=${VITE_API_URL}

# Build shared library and web SPA
RUN npm run build --workspace=@openproofpay/shared
RUN npm run build --workspace=@openproofpay/web

# ------------------------------------------------------------------------------
# Production Image: Nginx Alpine
# ------------------------------------------------------------------------------
FROM nginx:alpine AS runner

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
