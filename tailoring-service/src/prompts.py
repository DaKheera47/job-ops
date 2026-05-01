"""Prompt templates for resume tailoring."""


def summary_prompt(
    job_description: str,
    master_resume_json: str,
    output_language: str,
    tone: str,
    formality: str,
) -> str:
    """Generate prompt for summary tailoring."""
    return f"""You are an expert resume writer generating a tailored resume summary for a specific job application.

JOB DESCRIPTION (JD):
{job_description}

MY MASTER RESUME (compact format):
{master_resume_json}

INSTRUCTIONS:
- Generate a concise summary paragraph (max 3 sentences, ~60 words)
- Tailor it for the company's "About You" / requirements section
- Keep it warm, confident, and professional
- Write in {output_language}
- Do NOT invent experience
- Focus on relevant skills and experience from the master resume

WRITING STYLE:
- Tone: {tone}
- Formality: {formality}
- Output language: {output_language}

OUTPUT FORMAT:
{{"summary": "..."}}"""


def work_prompt(
    job_description: str,
    master_resume_json: str,
    generated_summary: str,
    output_language: str,
    tone: str,
    formality: str,
) -> str:
    """Generate prompt for work experience tailoring."""
    return f"""You are an expert resume writer generating tailored work experience for a specific job application.

JOB DESCRIPTION (JD):
{job_description}

MY MASTER RESUME (compact format):
{master_resume_json}

PREVIOUSLY GENERATED SUMMARY:
{generated_summary}

INSTRUCTIONS:
- Keep work entries in chronological order (do NOT reorder)
- You MUST generate an array of work entries that exactly matches the number of entries in the master resume.
- For EACH work entry, you MUST generate BOTH fields: "summary" AND "highlights"
- CRITICAL: Every single work entry must have a "summary" string AND a "highlights" array of bullet points.
- Summary: max 2 sentences, ~40 words
- Highlights: For the 3 most recent roles, generate 4-6 bullet points (~15 words each). For all older roles, generate 1-3 bullet points.
- CRITICAL: Work summary MUST be concise. Do NOT ramble. Do NOT repeat phrases. Stop at 2 sentences maximum.
- BAD example: "Managed the end-to-end SDLC and product strategy for diverse portfolios, including the launch of AI-native products and a consumer-facing Live Shopping MVP application. Collaborated closely with cross-functional engineering, analytics, and business teams to ship high-impact features and client releases within strict SLAs constraint factors and tight schedules..." (TOO LONG, RAMBLING)
- GOOD example: "Led product strategy for AI-native telecom products and consumer-facing MVPs. Collaborated with cross-functional teams to ship high-impact features within SLAs." (2 sentences, ~25 words)
- Do NOT include company, position, startDate, endDate - these are static (preserved from master resume)
- CRITICAL ANTI-HALLUCINATION: Do NOT invent or fabricate facts, metrics, or achievements. You may rephrase, re-contextualize, and tweak existing points to strongly align with the JD, but all claims MUST be strictly rooted in the facts from the master resume.
- Ensure consistency with the previously generated summary

WRITING STYLE:
- Tone: {tone}
- Formality: {formality}
- Output language: {output_language}

OUTPUT FORMAT:
{{"work": [{{"summary": "...", "highlights": ["..."]}}]}}"""


def supporting_prompt(
    job_description: str,
    master_resume_json: str,
    generated_summary: str,
    generated_work: str,
    output_language: str,
    tone: str,
    formality: str,
    max_pages: int,
    target_keywords: str,
) -> str:
    """Generate prompt for supporting sections tailoring."""
    return f"""You are an expert resume writer generating tailored supporting sections for a specific job application.

JOB DESCRIPTION (JD):
{job_description}

MY MASTER RESUME (compact format):
{master_resume_json}

PREVIOUSLY GENERATED SUMMARY:
{generated_summary}

PREVIOUSLY GENERATED WORK:
{generated_work}

INSTRUCTIONS:
1. "education" (Array):
   - Keep entries in chronological order (do NOT reorder)
   - For each entry, generate ONLY: courses (tailored coursework bullet points)
   - Do NOT include institution, area, studyType, startDate, endDate - these are static

2. "projects" (Array):
   - Keep entries in chronological order
   - Select 3-5 most relevant projects for this role
   - For selected projects, generate ONLY: description (tailored) and keywords (relevant skills)
   - Do NOT include name, startDate, endDate, url - these are static

3. "skills" (Array):
   - CRITICAL: You MUST include this array in your response
   - Select top 5 skills from JD
   - For each skill category, generate: keywords (selected skills) and proofPoint (1-sentence evidence from work history)
   - Keyword matching: swap synonyms to match JD exactly

4. "certificates" (Array):
   - Select only relevant certificates for this role
   - CRITICAL: Select a maximum of 25 certificates. Do NOT exceed 25.
   - For selected certificates, include: name, issuer
   - Do NOT invent new certifications

5. "metadata" (Object):
   - "pageCount": {max_pages}
   - "selectedSkills": top 5 skills selected for this role

WRITING STYLE:
- Tone: {tone}
- Formality: {formality}
- Output language: {output_language}

ATS SAFETY:
- Use exact technology names and acronyms from JD
- Max {max_pages} pages - optimize content density

OUTPUT FORMAT:
{{
  "education": [{{"courses": [...]}}],
  "projects": [{{"name": "...", "description": "...", "keywords": [...]}}],
  "skills": [{{"name": "...", "keywords": [...], "proofPoint": "..."}}],
  "certificates": [{{"name": "...", "issuer": "..."}}],
  "metadata": {{"pageCount": {max_pages}, "selectedSkills": [...]}}
}}"""

def cover_letter_prompt(
    job_description: str,
    master_resume_json: str,
    output_language: str,
    tone: str,
    formality: str,
) -> str:
    """Generate prompt for cover letter creation."""
    return f"""You are an expert career coach and executive resume writer drafting a tailored cover letter.

JOB DESCRIPTION (JD):
{job_description}

MY MASTER RESUME:
{master_resume_json}

INSTRUCTIONS:
1. Write a compelling 3-4 paragraph cover letter targeting the role described in the JD.
2. The letter should explicitly draw connections between the JD requirements and the specific experiences/achievements in the master resume.
3. Keep the language {tone} and {formality}.
4. Output MUST be purely in markdown format without any extra conversational filler.
5. Do NOT include placeholder addresses like "[Company Address]". Just start with a professional greeting.
6. The letter MUST be written in {output_language}.
7. You must return ONLY the markdown string inside the JSON structure.

Return the cover letter exactly as requested.
"""
