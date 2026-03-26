# --- Build stage ---
FROM node:22-alpine AS builder

WORKDIR /app

# Copy only dependency files for layer caching
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# --- Production stage ---
FROM node:22-alpine AS production

# Security: non-root user
RUN addgroup -S mcpgroup && adduser -S mcpuser -G mcpgroup

WORKDIR /app

# Production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy built code
COPY --from=builder /app/build ./build

# Switch to non-root user
USER mcpuser

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000

# Default: Streamable HTTP transport
CMD ["node", "build/index.js", "--transport", "streamable-http", "--port", "3000"]
