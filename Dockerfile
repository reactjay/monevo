# Stage 1: Build TypeScript source
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies for compiling TypeScript
RUN npm ci

# Copy source code and compile
COPY src/ ./src/
RUN npm run build

# Stage 2: Production runtime
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install fontconfig and basic fonts for Sharp/SVG receipt and financial chart rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fontconfig \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled JavaScript from builder
COPY --from=builder /app/dist ./dist

# Copy assets
COPY assets/ ./assets/

# Use unprivileged node user
USER node

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

CMD ["npm", "start"]
