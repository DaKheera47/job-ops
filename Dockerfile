# syntax=docker/dockerfile:1.6

FROM node:20-slim AS builder

ENV DEBIAN_FRONTEND=noninteractive
# Put Playwright browsers in a known cacheable location
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip curl ca-certificates git \
    build-essential pkg-config \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- Python deps (cached) ----
RUN --mount=type=cache,target=/root/.cache/pip \
    pip3 install --no-cache-dir --break-system-packages playwright python-jobspy

# Install Firefox for Python Playwright (cached via PLAYWRIGHT_BROWSERS_PATH layer + mount)
RUN python3 -m playwright install firefox

# ---- Node deps (copy lockfiles; cached) ----
COPY orchestrator/package*.json ./orchestrator/
COPY extractors/gradcracker/package*.json ./extractors/gradcracker/
COPY extractors/ukvisajobs/package*.json ./extractors/ukvisajobs/

WORKDIR /app/orchestrator
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --progress=false

WORKDIR /app/extractors/gradcracker
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --progress=false

# Camoufox fetch (cache npm + whatever it downloads to; if it uses HOME, this helps)
WORKDIR /app/extractors/gradcracker
RUN --mount=type=cache,target=/root/.npm \
    npx camoufox fetch

WORKDIR /app/extractors/ukvisajobs
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --progress=false

# ---- Copy sources late (preserves dependency cache) ----
WORKDIR /app
COPY orchestrator ./orchestrator
COPY extractors/gradcracker ./extractors/gradcracker
COPY extractors/jobspy ./extractors/jobspy
COPY extractors/ukvisajobs ./extractors/ukvisajobs

# Build orchestrator
WORKDIR /app/orchestrator
RUN npm run build


FROM node:20-slim AS runtime
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV PORT=3001
ENV PYTHON_PATH=/usr/bin/python3
ENV DATA_DIR=/app/data
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip curl ca-certificates \
    libgtk-3-0 libdbus-glib-1-2 libxt6 libx11-xcb1 libasound2 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python runtime deps
RUN --mount=type=cache,target=/root/.cache/pip \
    pip3 install --no-cache-dir --break-system-packages playwright python-jobspy

# Copy cached browsers from builder (fast; no redownload)
COPY --from=builder /ms-playwright /ms-playwright
COPY --from=builder /root/.cache/camoufox /root/.cache/camoufox

# Copy built app + node_modules from builder (fast path)
COPY --from=builder /app/orchestrator /app/orchestrator
COPY --from=builder /app/extractors /app/extractors

RUN mkdir -p /app/data/pdfs

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

WORKDIR /app/orchestrator
CMD ["sh", "-c", "npm run db:migrate && npm run start"]
