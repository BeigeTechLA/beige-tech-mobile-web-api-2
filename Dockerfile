# Multi-stage production Dockerfile for Beige Backend
FROM node:18-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    tzdata

# Set working directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Copy package files
COPY package.json yarn.lock ./

# Development stage
FROM base AS development
ENV NODE_ENV=development
RUN yarn install --frozen-lockfile
COPY . .
USER nodejs
EXPOSE 5001
CMD ["dumb-init", "yarn", "dev"]

# Production dependencies stage
FROM base AS prod-deps
ENV NODE_ENV=production
RUN yarn install --frozen-lockfile --production && \
    yarn cache clean

# Production build stage
FROM base AS production

# Set production environment
ENV NODE_ENV=production
ENV PORT=5001

# Copy production dependencies
COPY --from=prod-deps /app/node_modules ./node_modules

# Copy application source
COPY --chown=nodejs:nodejs . .

# Remove unnecessary files for production
RUN rm -rf \
    tests/ \
    .github/ \
    .git/ \
    *.md \
    .env.example \
    docker-compose*.yml \
    Dockerfile* \
    .eslintrc.js \
    .prettierrc.js \
    jest.config.js \
    playwright.config.js

# Create logs directory
RUN mkdir -p logs && chown nodejs:nodejs logs

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api/v1/health || exit 1

# Expose port
EXPOSE 5001

# Start application with dumb-init for proper signal handling
CMD ["dumb-init", "node", "src/index.js"]