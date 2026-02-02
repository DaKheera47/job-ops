# syntax=docker/dockerfile:1.6

FROM node:22-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV PORT=3001
ENV PYTHON_PATH=/usr/bin/python3
ENV DATA_DIR=/app/data
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Install system dependencies in smaller groups to avoid disk space issues
RUN apt-get update --allow-insecure-repositories 2>/dev/null || true && \
    apt-get install -y --no-install-recommends --allow-unauthenticated ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

RUN apt-get update --allow-insecure-repositories 2>/dev/null || true && \
    apt-get install -y --no-install-recommends --allow-unauthenticated \
    python3 python3-minimal libpython3.11-minimal && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

RUN apt-get update --allow-insecure-repositories 2>/dev/null || true && \
    apt-get install -y --no-install-recommends --allow-unauthenticated \
    python3-pip curl git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

RUN apt-get update --allow-insecure-repositories 2>/dev/null || true && \
    apt-get install -y --no-install-recommends --allow-unauthenticated \
    build-essential pkg-config && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

RUN apt-get update --allow-insecure-repositories 2>/dev/null || true && \
    apt-get install -y --no-install-recommends --allow-unauthenticated \
    libgtk-3-0 libgtk-3-common && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

RUN apt-get update --allow-insecure-repositories 2>/dev/null || true && \
    apt-get install -y --no-install-recommends --allow-unauthenticated \
    libdbus-glib-1-2 libxt6 libx11-xcb1 libasound2 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

WORKDIR /app

# ---- Python deps (cached) ----
RUN --mount=type=cache,target=/root/.cache/pip \
    pip3 install --no-cache-dir --break-system-packages playwright python-jobspy

# Install Firefox for Python Playwright
RUN python3 -m playwright install firefox

# ---- Node deps (copy lockfiles; cached) ----
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY orchestrator/package*.json ./orchestrator/
COPY extractors/gradcracker/package*.json ./extractors/gradcracker/
COPY extractors/ukvisajobs/package*.json ./extractors/ukvisajobs/

WORKDIR /app
RUN --mount=type=cache,target=/root/.npm \
    npm install --workspaces --include-workspace-root --include=dev --no-audit --no-fund --progress=false

# Camoufox fetch (cache npm + whatever it downloads to)
WORKDIR /app/extractors/gradcracker
RUN --mount=type=cache,target=/root/.npm \
    npx camoufox fetch

# ---- Copy sources ----
WORKDIR /app
COPY shared ./shared
COPY orchestrator ./orchestrator
COPY extractors/gradcracker ./extractors/gradcracker
COPY extractors/jobspy ./extractors/jobspy
COPY extractors/ukvisajobs ./extractors/ukvisajobs

# Build client bundle for production
WORKDIR /app/orchestrator
RUN npm run build:client

WORKDIR /app

RUN mkdir -p /app/data/pdfs

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

WORKDIR /app/orchestrator
CMD ["sh", "-c", "npx tsx src/server/db/migrate.ts && npm run start"]
