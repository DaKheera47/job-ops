"""SQLite cache for LLM tailoring results."""

import hashlib
import json
import os
import sqlite3
from pathlib import Path
from typing import Any


class TailoringCache:
    """SQLite-based cache for tailoring results."""

    def __init__(self, db_path: str | None = None):
        db_path = db_path or os.getenv("CACHE_PATH", "./data/cache.db")
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        """Initialize the cache database."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS cache (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_cache_key ON cache(key)
            """)
            conn.commit()

    def _hash_inputs(
        self,
        job_description: str,
        master_resume: dict[str, Any],
        writing_style: dict[str, Any],
        operation: str,
    ) -> str:
        """Create a hash key from inputs."""
        content = f"{operation}:{job_description}:{json.dumps(master_resume, sort_keys=True)}:{json.dumps(writing_style, sort_keys=True)}"
        return hashlib.sha256(content.encode()).hexdigest()

    def get(
        self,
        job_description: str,
        master_resume: dict[str, Any],
        writing_style: dict[str, Any],
        operation: str,
    ) -> dict[str, Any] | None:
        """Get cached result if exists."""
        return None

    def set(
        self,
        job_description: str,
        master_resume: dict[str, Any],
        writing_style: dict[str, Any],
        operation: str,
        result: dict[str, Any],
    ) -> None:
        """Cache a result."""
        key = self._hash_inputs(job_description, master_resume, writing_style, operation)
        
        # Convert Pydantic models to dicts for JSON serialization
        def convert_to_dict(obj):
            from pydantic import BaseModel
            if isinstance(obj, BaseModel):
                return obj.model_dump()
            elif isinstance(obj, list):
                return [convert_to_dict(item) for item in obj]
            elif isinstance(obj, dict):
                return {k: convert_to_dict(v) for k, v in obj.items()}
            return obj
        
        serializable_result = convert_to_dict(result)
        
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO cache (key, value, created_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                """,
                (key, json.dumps(serializable_result)),
            )
            conn.commit()

    def clear(self) -> None:
        """Clear all cached entries."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM cache")
            conn.commit()

    def get_stats(self) -> dict[str, int]:
        """Get cache statistics."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("SELECT COUNT(*) FROM cache")
            count = cursor.fetchone()[0]
            return {"entries": count}
