"""LLM client using native Gemini API with structured output support."""

import asyncio
import logging
import os
from typing import Any, TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel

logger = logging.getLogger("tailoring-service.llm")

T = TypeVar("T", bound=BaseModel)


class LLMError(Exception):
    """Error from LLM generation."""
    pass


class LLMClient:
    """LLM client with structured output support using native Gemini API."""

    def __init__(self, api_key: str | None = None, model: str = "gemini-3-flash-preview"):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not set")
        
        self.model = model
        # Create client using new google-genai API
        self.client = genai.Client(api_key=self.api_key)

    async def generate_structured(
        self,
        prompt: str,
        response_model: type[T],
        max_retries: int = 3,
        timeout: float = 60.0,
    ) -> T:
        """Generate structured output from LLM using native Gemini API."""
        last_error = None
        model_name = response_model.__name__
        
        logger.info(f"LLM request: model={self.model}, schema={model_name}, prompt_length={len(prompt)}")
        
        for attempt in range(max_retries):
            try:
                # Use native Gemini API with response_schema
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        self.client.models.generate_content,
                        model=self.model,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            response_schema=response_model,
                        ),
                    ),
                    timeout=timeout,
                )
                
                # Parse the JSON response into the Pydantic model
                if response.text:
                    import json
                    data = json.loads(response.text)
                    logger.info(f"LLM response received: {len(response.text)} chars for {model_name}")
                    return response_model(**data)
                else:
                    raise LLMError("Empty response from LLM")
                    
            except asyncio.TimeoutError:
                last_error = f"Timeout after {timeout}s"
                logger.warning(f"LLM attempt {attempt + 1}/{max_retries} timed out for {model_name}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(1 * (attempt + 1))  # Exponential backoff
                    continue
            except Exception as e:
                last_error = str(e)
                logger.error(f"LLM attempt {attempt + 1}/{max_retries} failed for {model_name}: {last_error}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(1 * (attempt + 1))
                    continue
                raise LLMError(f"LLM generation failed after {max_retries} attempts: {last_error}") from e
        
        raise LLMError(f"LLM generation failed after {max_retries} attempts: {last_error}")

    async def generate_with_schema(
        self,
        prompt: str,
        json_schema: dict[str, Any],
        max_retries: int = 3,
        timeout: float = 60.0,
    ) -> dict[str, Any]:
        """Generate with explicit JSON schema (fallback method)."""
        try:
            # Use native Gemini with response schema
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    self.client.models.generate_content,
                    model=self.model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=json_schema,
                    ),
                ),
                timeout=timeout,
            )
            
            # Parse JSON response
            import json
            if response.text:
                return json.loads(response.text)
            else:
                raise LLMError("Empty response from LLM")
        except asyncio.TimeoutError:
            raise LLMError(f"LLM call timed out after {timeout}s")
        except Exception as e:
            raise LLMError(f"LLM generation failed: {e}") from e
