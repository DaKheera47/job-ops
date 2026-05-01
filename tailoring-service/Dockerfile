# Python Tailoring Service Dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir \
    fastapi>=0.115.0 \
    uvicorn[standard]>=0.32.0 \
    instructor>=1.6.0 \
    prefect>=3.0.0 \
    pydantic>=2.9.0 \
    google-generativeai>=0.8.0 \
    httpx>=0.27.0 \
    python-dotenv>=1.0.0 \
    diskcache>=5.6.0

# Copy source code
COPY src/ ./src/

# Set environment variables
ENV PYTHONPATH=/app/src
ENV PYTHONUNBUFFERED=1

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Run the application
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
