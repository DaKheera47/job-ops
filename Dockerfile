# syntax=docker/dockerfile:1.6

# ============================================================================
# SHARED BASE IMAGES
# ============================================================================
FROM node:22-slim AS runtime-base

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV PORT=3001
ENV PYTHON_PATH=/usr/bin/python3
ENV DATA_DIR=/app/data
ENV CODEX_HOME=/app/codex-home
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PATH=/root/.local/bin:${PATH}
ARG CODEX_CLI_VERSION=0.120.0

# Install runtime dependencies shared by build and production stages.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    python3 python3-minimal libpython3.11-minimal \
    python3-pip \
    libgtk-3-0 libgtk-3-common \
    libdbus-glib-1-2 libxt6 libx11-xcb1 libasound2 \
    curl && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Install Codex CLI for local app-server based inference.
RUN npm install -g @openai/codex@${CODEX_CLI_VERSION}

WORKDIR /app

FROM runtime-base AS build-base

# Install compiler toolchain only for build-oriented stages.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# ============================================================================
# BUILD INPUT STAGES
# ============================================================================
FROM build-base AS python-deps

# Install Python dependencies with pip cache.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip3 install --break-system-packages playwright python-jobspy

# Install Firefox for Python Playwright.
RUN python3 -m playwright install firefox

FROM build-base AS node-deps

# Copy package files for dependency installation.
COPY package*.json ./
COPY scripts/camoufox-fetch.mjs ./scripts/camoufox-fetch.mjs
COPY docs-site/package*.json ./docs-site/
COPY shared/package*.json ./shared/
COPY orchestrator/package*.json ./orchestrator/
COPY extractors/adzuna/package*.json ./extractors/adzuna/
COPY extractors/hiringcafe/package*.json ./extractors/hiringcafe/
COPY extractors/gradcracker/package*.json ./extractors/gradcracker/
COPY extractors/startupjobs/package*.json ./extractors/startupjobs/
COPY extractors/workingnomads/package*.json ./extractors/workingnomads/
COPY extractors/golangjobs/package*.json ./extractors/golangjobs/
COPY extractors/ukvisajobs/package*.json ./extractors/ukvisajobs/
COPY extractors/seek/package*.json ./extractors/seek/
COPY extractors/browser-utils/package*.json ./extractors/browser-utils/

# Install Node dependencies with npm cache (dev deps needed for build).
RUN --mount=type=cache,target=/root/.npm \
    npm install --workspaces --include-workspace-root --include=dev \
    --no-audit --no-fund --progress=false

# Fetch Camoufox binaries before copying source to keep the download cached.
RUN --mount=type=secret,id=github_token,required=false \
    sh -c 'GITHUB_TOKEN="$([ -f /run/secrets/github_token ] && cat /run/secrets/github_token || true)" node ./scripts/camoufox-fetch.mjs'

FROM node-deps AS build-sources

COPY shared ./shared
COPY docs-site ./docs-site
COPY orchestrator ./orchestrator
COPY visa-sponsor-providers ./visa-sponsor-providers
COPY extractors/adzuna ./extractors/adzuna
COPY extractors/hiringcafe ./extractors/hiringcafe
COPY extractors/gradcracker ./extractors/gradcracker
COPY extractors/jobspy ./extractors/jobspy
COPY extractors/startupjobs ./extractors/startupjobs
COPY extractors/workingnomads ./extractors/workingnomads
COPY extractors/golangjobs ./extractors/golangjobs
COPY extractors/ukvisajobs ./extractors/ukvisajobs
COPY extractors/seek ./extractors/seek
COPY extractors/browser-utils ./extractors/browser-utils

# ============================================================================
# PARALLEL BUILD STAGES
# ============================================================================
FROM build-sources AS docs-build

WORKDIR /app/docs-site
RUN npm run build

FROM build-sources AS client-build

WORKDIR /app/orchestrator
RUN npm run build:client

# ============================================================================
# PRODUCTION INPUT STAGES
# ============================================================================
FROM runtime-base AS runtime-node-deps

# Install virtual display dependencies for the headed Cloudflare challenge solver.
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb x11vnc novnc websockify && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Copy package files for production dependency installation.
COPY package*.json ./
COPY docs-site/package*.json ./docs-site/
COPY shared/package*.json ./shared/
COPY orchestrator/package*.json ./orchestrator/
COPY extractors/adzuna/package*.json ./extractors/adzuna/
COPY extractors/hiringcafe/package*.json ./extractors/hiringcafe/
COPY extractors/gradcracker/package*.json ./extractors/gradcracker/
COPY extractors/startupjobs/package*.json ./extractors/startupjobs/
COPY extractors/workingnomads/package*.json ./extractors/workingnomads/
COPY extractors/golangjobs/package*.json ./extractors/golangjobs/
COPY extractors/ukvisajobs/package*.json ./extractors/ukvisajobs/
COPY extractors/seek/package*.json ./extractors/seek/
COPY extractors/browser-utils/package*.json ./extractors/browser-utils/

# Install production Node dependencies only.
RUN --mount=type=cache,target=/root/.npm \
    npm install --workspaces --include-workspace-root --omit=dev \
    --no-audit --no-fund --progress=false

FROM runtime-base AS tectonic

ARG TARGETARCH
ENV TECTONIC_VERSION=0.15.0

# Install Tectonic for local LaTeX resume rendering.
# Upstream publishes a musl Linux ARM build but not a glibc one, so map
# Docker's target architecture to the matching release asset explicitly.
RUN set -eux; \
    case "${TARGETARCH}" in \
        amd64) tectonic_arch="x86_64-unknown-linux-gnu" ;; \
        arm64) tectonic_arch="aarch64-unknown-linux-musl" ;; \
        *) echo "Unsupported TARGETARCH for Tectonic: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    tectonic_asset="tectonic-${TECTONIC_VERSION}-${tectonic_arch}.tar.gz"; \
    curl --proto '=https' --tlsv1.2 -fsSL \
        "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/${tectonic_asset}" \
        -o /tmp/tectonic.tar.gz; \
    tar -xzf /tmp/tectonic.tar.gz -C /tmp; \
    install -m 0755 "/tmp/tectonic" /usr/local/bin/tectonic; \
    rm -f /tmp/tectonic.tar.gz /tmp/tectonic

# ============================================================================
# PRODUCTION STAGE
# ============================================================================
FROM runtime-node-deps AS production

# Copy production-only runtime assets from sibling stages.
COPY --from=tectonic /usr/local/bin/tectonic /usr/local/bin/tectonic
COPY --from=python-deps /usr/local/lib/python3.11/dist-packages /usr/local/lib/python3.11/dist-packages
COPY --from=python-deps /ms-playwright /ms-playwright
COPY --from=node-deps /root/.cache/camoufox /root/.cache/camoufox

# Copy built assets and runtime source code.
COPY --from=client-build /app/orchestrator/dist ./orchestrator/dist
COPY --from=docs-build /app/docs-site/build ./orchestrator/dist/docs
COPY shared ./shared
COPY orchestrator ./orchestrator
COPY visa-sponsor-providers ./visa-sponsor-providers
COPY extractors/adzuna ./extractors/adzuna
COPY extractors/hiringcafe ./extractors/hiringcafe
COPY extractors/gradcracker ./extractors/gradcracker
COPY extractors/jobspy ./extractors/jobspy
COPY extractors/startupjobs ./extractors/startupjobs
COPY extractors/workingnomads ./extractors/workingnomads
COPY extractors/golangjobs ./extractors/golangjobs
COPY extractors/ukvisajobs ./extractors/ukvisajobs
COPY extractors/seek ./extractors/seek
COPY extractors/browser-utils ./extractors/browser-utils

# Create runtime directories.
RUN mkdir -p /app/data/pdfs /app/data/cloudflare-cookies /app/codex-home

ENV DISPLAY=:99
ENV NOVNC_PORT=6080
ENV NOVNC_HOST=127.0.0.1
ENV VNC_HOST=127.0.0.1

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

WORKDIR /app/orchestrator
ENTRYPOINT ["/app/docker-entrypoint.sh"]
