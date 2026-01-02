# =============================================================================
# Job Ops - Slim Docker Image
# Only includes Firefox (for Camoufox) - much smaller than full Playwright
# =============================================================================

FROM node:20-slim AS base

# Install system dependencies for browsers and Python
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    # Firefox dependencies
    libgtk-3-0 \
    libdbus-glib-1-2 \
    libxt6 \
    libx11-xcb1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Playwright and Firefox only (plus JobSpy for Indeed/LinkedIn scraping)
RUN pip3 install --no-cache-dir --break-system-packages playwright python-jobspy && \
    npx playwright install firefox

# Copy package files first for better caching
COPY orchestrator/package*.json ./orchestrator/
COPY extractors/gradcracker/package*.json ./extractors/gradcracker/
COPY extractors/ukvisajobs/package*.json ./extractors/ukvisajobs/

# Install Node.js dependencies
WORKDIR /app/orchestrator
RUN npm install --production=false

WORKDIR /app/extractors/gradcracker
RUN npm install --production=false

# Install Camoufox browser (downloads its own Firefox fork)
RUN npx camoufox fetch

WORKDIR /app/extractors/ukvisajobs
RUN npm install --production=false

# Copy source code
WORKDIR /app
COPY orchestrator ./orchestrator
COPY extractors/gradcracker ./extractors/gradcracker
COPY extractors/jobspy ./extractors/jobspy
COPY extractors/ukvisajobs ./extractors/ukvisajobs
COPY resume-generator ./resume-generator

# Build the orchestrator (client + server)
WORKDIR /app/orchestrator
RUN npm run build

# Create data directories
RUN mkdir -p /app/data/pdfs

# Expose ports
EXPOSE 3001

# Environment variables (can be overridden)
ENV NODE_ENV=production
ENV PORT=3001
ENV PYTHON_PATH=/usr/bin/python3
ENV DATA_DIR=/app/data
ENV RESUME_GEN_DIR=/app/resume-generator

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Run migrations and start the server
WORKDIR /app/orchestrator
CMD ["sh", "-c", "npm run db:migrate && npm run start"]
