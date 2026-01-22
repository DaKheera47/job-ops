"""
Generate a tailored résumé summary using AI (OpenRouter API).
"""

import os
import json
import requests
import pyperclip
from dotenv import load_dotenv


def load_profile(path: str = "./base.json") -> dict:
    """Load the user's profile from a JSON file."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_job_description(from_clipboard: bool = True, path: str = None) -> str:
    """
    Load the job description from clipboard or a file.

    Args:
        from_clipboard: If True, read from system clipboard
        path: If from_clipboard is False, read from this file path

    Returns:
        The job description text
    """
    if from_clipboard:
        return pyperclip.paste().strip()
    if path:
        with open(path, "r", encoding="utf-8") as f:
            return f.read().strip()
    raise ValueError("No job description source provided.")


def _build_prompt(profile: dict, jd: str) -> str:
    """Build the prompt for the AI model."""
    return f"""
You are generating a tailored résumé summary for me.

Requirements:
- Use keywords found in the job description.
- Keep it concise but meaningful. Avoid fluff. Avoid long-winded text.
- Include just enough detail to feel real and grounded.
- Gently convey that I care about helping people and doing good work.
- Do NOT invent experience or skills I don't have.
- Maintain a warm, confident, human tone.
- Target THIS specific job directly, so use ATS keywords, while remaining natural.
- Use the profile to add context and details.

My profile (JSON fields merged):
{json.dumps(profile, indent=2)}

Job description:
{jd}

Write the résumé summary now.
"""


def _call_openrouter(prompt: str, model: str, api_key: str) -> str:
    """Call OpenRouter API to generate text."""
    url = "https://openrouter.ai/api/v1/chat/completions"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "http://localhost",
        "X-Title": "ResumeSummaryScript",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "plugins": [{"id": "response-healing"}],
    }

    response = requests.post(url, headers=headers, json=payload)

    if response.status_code != 200:
        raise RuntimeError(f"OpenRouter error {response.status_code}: {response.text}")

    data = response.json()
    return data["choices"][0]["message"]["content"]


def generate_resume_summary(
    profile_path: str = "./base.json",
    job_description: str = None,
    from_clipboard: bool = True,
    copy_to_clipboard: bool = True,
) -> str:
    """
    Generate a tailored résumé summary using AI.

    Uses the user's profile and a job description to generate a personalized
    summary section for a résumé, targeting the specific job.

    Args:
        profile_path: Path to the profile JSON file
        job_description: Job description text (if None, uses from_clipboard/path)
        from_clipboard: If job_description is None, read JD from clipboard
        copy_to_clipboard: If True, copy the generated summary to clipboard

    Returns:
        The generated résumé summary text
    """
    load_dotenv()

    api_key = os.getenv("OPENROUTER_API_KEY")
    model = os.getenv("MODEL", "openai/gpt-4o-mini")

    if not api_key:
        raise RuntimeError("Missing OPENROUTER_API_KEY in .env")

    profile = load_profile(profile_path)

    if job_description is None:
        jd = load_job_description(from_clipboard=from_clipboard)
    else:
        jd = job_description

    prompt = _build_prompt(profile, jd)
    summary = _call_openrouter(prompt, model, api_key)

    if copy_to_clipboard:
        pyperclip.copy(summary)

    return summary


if __name__ == "__main__":
    summary = generate_resume_summary()

    print("\n=== Generated Summary ===\n")
    print(summary)
    print("\n[Summary copied to clipboard]\n")
