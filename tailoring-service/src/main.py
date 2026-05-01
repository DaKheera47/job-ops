"""FastAPI application for resume tailoring service."""

import asyncio
import json
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from cache import TailoringCache
from flows import tailor_resume_flow
from schemas import Constraints, TailorRequest, TailorResponse, WritingStyle

# Configure logging
log_dir = Path("./logs")
log_dir.mkdir(exist_ok=True)
log_file = log_dir / f"tailoring_{datetime.now().strftime('%Y%m%d')}.log"

# Detailed request/response log
requests_log_file = log_dir / f"requests_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jsonl"

def log_request_response(request_id: str, job_id: str, request_data: dict, response_data: dict, duration_ms: float):
    """Log detailed request/response to JSONL file."""
    entry = {
        "timestamp": datetime.now().isoformat(),
        "request_id": request_id,
        "job_id": job_id,
        "duration_ms": duration_ms,
        "request": request_data,
        "response": response_data,
    }
    with open(requests_log_file, "a") as f:
        f.write(json.dumps(entry, default=str) + "\n")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler(),
    ]
)
logger = logging.getLogger("tailoring-service")
logger.info(f"Logging to file: {log_file.absolute()}")
logger.info(f"Request/response log: {requests_log_file.absolute()}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    logger.info("Starting Tailoring Service...")
    logger.info(f"Cache path: {os.getenv('CACHE_PATH', './data/cache.db')}")
    logger.info(f"Gemini API key configured: {bool(os.getenv('GEMINI_API_KEY'))}")
    yield
    # Shutdown
    logger.info("Shutting down Tailoring Service...")


app = FastAPI(
    title="Resume Tailoring Service",
    description="Python-based LLM service for resume tailoring using Instructor + Prefect",
    version="0.1.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all requests with timing."""
    request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
    request.state.request_id = request_id
    
    start_time = time.time()
    path = request.url.path
    method = request.method
    
    logger.info({
        "event": "request_start",
        "request_id": request_id,
        "method": method,
        "path": path,
    })
    
    response = await call_next(request)
    duration_ms = round((time.time() - start_time) * 1000, 2)
    
    logger.info({
        "event": "request_complete",
        "request_id": request_id,
        "method": method,
        "path": path,
        "status": response.status_code,
        "duration_ms": duration_ms,
    })
    
    # Add request ID to response headers
    response.headers["x-request-id"] = request_id
    return response


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "tailoring-service"}


@app.get("/cache/stats")
async def cache_stats():
    """Get cache statistics."""
    cache = TailoringCache()
    return cache.get_stats()


@app.post("/tailor", response_model=TailorResponse)
async def tailor_resume(request: TailorRequest, req: Request):
    """Tailor a resume for a specific job description."""
    request_id = getattr(req.state, "request_id", str(uuid.uuid4()))
    job_id = request.jobId or "unknown"
    
    logger.info({
        "event": "tailoring_start",
        "request_id": request_id,
        "job_id": job_id,
        "constraints": request.constraints.model_dump(),
    })
    
    try:
        # Run the Prefect flow
        start_time = time.time()
        result, cover_letter = await tailor_resume_flow(
            job_description=request.jobDescription,
            master_resume=request.masterResumeJson,
            writing_style=request.writingStyle,
            constraints=request.constraints.model_dump(),
        )
        duration_ms = round((time.time() - start_time) * 1000, 2)
        
        # Extract metadata
        metadata = result.get("metadata", {})
        
        # Extract proof points from skills
        skills = result.get("skills", [])
        proof_points = {}
        for skill in skills:
            if isinstance(skill, dict) and skill.get("proofPoint"):
                proof_points[skill.get("name", "")] = skill["proofPoint"]
        
        # Log what summary is being returned
        summary_returned = result.get("summary", "(empty)")
        log_data = {
            "event": "tailoring_complete",
            "request_id": request_id,
            "job_id": job_id,
            "duration_ms": duration_ms,
            "success": True,
            "summary_preview": summary_returned[:100] if summary_returned else "(empty)",
            "has_summary": bool(summary_returned and summary_returned.strip()),
        }
        logger.info(log_data)
        print(f"[MAIN] Response summary: {summary_returned[:150]}...", flush=True)
        print(f"[MAIN] Full result keys: {list(result.keys())}", flush=True)
        
        # Save detailed request/response to file
        log_request_response(
            request_id=request_id,
            job_id=job_id,
            request_data={
                "job_description": request.jobDescription[:200] + "..." if len(request.jobDescription) > 200 else request.jobDescription,
                "constraints": request.constraints.model_dump(),
            },
            response_data={
                "success": True,
                "summary": summary_returned,
                "has_work": bool(result.get("work")),
                "has_education": bool(result.get("education")),
                "has_skills": bool(result.get("skills")),
            },
            duration_ms=duration_ms,
        )
        
        return TailorResponse(
            success=True,
            data={
                "tailoredResumeJson": result,
                "metadata": {
                    "pageCount": metadata.get("pageCount", 2),
                    "selectedSkills": metadata.get("selectedSkills", []),
                    "proofPoints": proof_points,
                },
            },
            coverLetter=cover_letter,
        )
    
    except Exception as e:
        logger.error({
            "event": "tailoring_failed",
            "request_id": request_id,
            "job_id": job_id,
            "error": str(e),
        })
        return TailorResponse(
            success=False,
            error=str(e),
        )


@app.post("/tailor/batch")
async def tailor_batch(requests: list[TailorRequest]):
    """Tailor multiple resumes in batch."""
    results = []
    
    for request in requests:
        try:
            result = await tailor_resume_flow(
                job_description=request.jobDescription,
                master_resume=request.masterResumeJson,
                writing_style=request.writingStyle,
                constraints=request.constraints.model_dump(),
            )
            
            metadata = result.get("metadata", {})
            skills = result.get("skills", [])
            proof_points = {}
            for skill in skills:
                if isinstance(skill, dict) and skill.get("proofPoint"):
                    proof_points[skill.get("name", "")] = skill["proofPoint"]
            
            results.append({
                "success": True,
                "data": {
                    "tailoredResumeJson": result,
                    "metadata": {
                        "pageCount": metadata.get("pageCount", 2),
                        "selectedSkills": metadata.get("selectedSkills", []),
                        "proofPoints": proof_points,
                    },
                },
            })
        
        except Exception as e:
            results.append({
                "success": False,
                "error": str(e),
            })
    
    return {"results": results}


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler."""
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": str(exc),
        },
    )


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info",
    )
