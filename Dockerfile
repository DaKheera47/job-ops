# syntax=docker/dockerfile:1.6

# ============================================================================
# BUILD STAGE
# ============================================================================
FROM node:22-slim AS builder

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    python3 python3-minimal libpython3.11-minimal \
    python3-pip \
    build-essential pkg-config \
    libgtk-3-0 libgtk-3-common \
    libdbus-glib-1-2 libxt6 libx11-xcb1 libasound2 \
    curl && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

WORKDIR /app

# Install Python dependencies with pip cache
RUN --mount=type=cache,target=/root/.cache/pip \
    pip3 install --no-cache-dir --break-system-packages playwright python-jobspy

# Install Firefox for Python Playwright with cache
RUN --mount=type=cache,target=/root/.cache/pip \
    python3 -m playwright install firefox

# Copy package files for dependency installation
COPY package*.json ./
COPY docs-site/package*.json ./docs-site/
COPY shared/package*.json ./shared/
COPY orchestrator/package*.json ./orchestrator/
COPY extractors/adzuna/package*.json ./extractors/adzuna/
COPY extractors/hiringcafe/package*.json ./extractors/hiringcafe/
COPY extractors/gradcracker/package*.json ./extractors/gradcracker/
COPY extractors/ukvisajobs/package*.json ./extractors/ukvisajobs/

# Install Node dependencies with npm cache (dev deps needed for build)
RUN --mount=type=cache,target=/root/.npm \
    npm install --workspaces --include-workspace-root --include=dev \
    --no-audit --no-fund --progress=false

# Fetch Camoufox binaries - do this before copying source code to cache the download
# Even if source changes, this layer remains cached.
RUN npx camoufox-js fetch

# Copy source code
WORKDIR /app
COPY shared ./shared
COPY docs-site ./docs-site
COPY orchestrator ./orchestrator
COPY extractors/adzuna ./extractors/adzuna
COPY extractors/hiringcafe ./extractors/hiringcafe
COPY extractors/gradcracker ./extractors/gradcracker
COPY extractors/jobspy ./extractors/jobspy
COPY extractors/ukvisajobs ./extractors/ukvisajobs

# Build documentation site bundle
WORKDIR /app/docs-site
RUN npm run build

# Build client bundle
WORKDIR /app/orchestrator
RUN npm run build:client

# ============================================================================
# PRODUCTION STAGE
# ============================================================================
FROM node:22-slim AS production

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV PORT=3001
ENV PYTHON_PATH=/usr/bin/python3
ENV DATA_DIR=/app/data
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Install only runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    python3 python3-minimal libpython3.11-minimal \
    python3-pip \
    libgtk-3-0 libgtk-3-common \
    libdbus-glib-1-2 libxt6 libx11-xcb1 libasound2 \
    curl && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

WORKDIR /app

# Copy Python dependencies from builder
COPY --from=builder /usr/local/lib/python3.11/dist-packages /usr/local/lib/python3.11/dist-packages
COPY --from=builder /ms-playwright /ms-playwright

# Copy package files
COPY package*.json ./
COPY docs-site/package*.json ./docs-site/
COPY shared/package*.json ./shared/
COPY orchestrator/package*.json ./orchestrator/
COPY extractors/adzuna/package*.json ./extractors/adzuna/
COPY extractors/hiringcafe/package*.json ./extractors/hiringcafe/
COPY extractors/gradcracker/package*.json ./extractors/gradcracker/
COPY extractors/ukvisajobs/package*.json ./extractors/ukvisajobs/

# Install production Node dependencies only
RUN --mount=type=cache,target=/root/.npm \
    npm install --workspaces --include-workspace-root --omit=dev \
    --no-audit --no-fund --progress=false

# Copy built assets and source code from builder
COPY --from=builder /app/orchestrator/dist ./orchestrator/dist
COPY --from=builder /app/docs-site/build ./orchestrator/dist/docs
COPY shared ./shared
COPY orchestrator ./orchestrator
COPY extractors/adzuna ./extractors/adzuna
COPY extractors/hiringcafe ./extractors/hiringcafe
COPY extractors/gradcracker ./extractors/gradcracker
COPY extractors/jobspy ./extractors/jobspy
COPY extractors/ukvisajobs ./extractors/ukvisajobs

# Reuse Camoufox binaries from builder instead of fetching again
COPY --from=builder /root/.cache/camoufox /root/.cache/camoufox

WORKDIR /app
# Create data directory
RUN mkdir -p /app/data/pdfs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

WORKDIR /app/orchestrator
CMD ["sh", "-c", "npx tsx src/server/db/migrate.ts && npm run start"]
