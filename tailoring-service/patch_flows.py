import re

with open("src/flows.py", "r") as f:
    content = f.read()

# Add imports
if "from schemas import CoverLetterOutput" not in content:
    content = content.replace(
        "from schemas import SummaryOutput, SupportingOutput, WorkOutput, WritingStyle",
        "from schemas import CoverLetterOutput, SummaryOutput, SupportingOutput, WorkOutput, WritingStyle"
    )

if "from prompts import cover_letter_prompt" not in content:
    content = content.replace(
        "from prompts import summary_prompt, supporting_prompt, work_prompt",
        "from prompts import cover_letter_prompt, summary_prompt, supporting_prompt, work_prompt"
    )

# Add generate_cover_letter task
if "async def generate_cover_letter" not in content:
    cover_letter_task = """
@task(retries=3, retry_delay_seconds=[2, 4, 8])
async def generate_cover_letter(
    job_description: str,
    master_resume: dict[str, Any],
    writing_style: WritingStyle,
) -> str:
    \"\"\"Generate tailored cover letter.\"\"\"
    # Generate prompt
    prompt = cover_letter_prompt(
        job_description=job_description,
        master_resume_json=json.dumps(master_resume),
        output_language=writing_style.manualLanguage,
        tone=writing_style.tone,
        formality=writing_style.formality,
    )
    
    # Call LLM
    client = LLMClient()
    result = await client.generate_structured(prompt, CoverLetterOutput)
    
    # Log the LLM output for debugging
    logger.info(f"LLM generated cover letter: {len(result.cover_letter)} chars")
    
    return result.cover_letter

@flow(name="tailor_resume", log_prints=True)"""
    content = content.replace("@flow(name=\"tailor_resume\", log_prints=True)", cover_letter_task)

# Update tailor_resume_flow return type
content = content.replace(
    ") -> dict[str, Any]:",
    ") -> tuple[dict[str, Any], str]:"
)

# Call generate_cover_letter in tailor_resume_flow
if "cover_letter = await generate_cover_letter" not in content:
    call_replacement = """    # Step 3: Generate supporting (with summary + work context)
    supporting = await generate_supporting(
        job_description=job_description,
        master_resume=master_resume,
        writing_style=writing_style,
        constraints=constraints,
        generated_summary=summary,
        generated_work=work,
    )
    
    # Step 4: Generate cover letter
    cover_letter = await generate_cover_letter(
        job_description=job_description,
        master_resume=master_resume,
        writing_style=writing_style,
    )
"""
    content = content.replace("""    # Step 3: Generate supporting (with summary + work context)
    supporting = await generate_supporting(
        job_description=job_description,
        master_resume=master_resume,
        writing_style=writing_style,
        constraints=constraints,
        generated_summary=summary,
        generated_work=work,
    )""", call_replacement)

# Update return statement
content = content.replace(
    "return tailored_resume",
    "return tailored_resume, cover_letter"
)

with open("src/flows.py", "w") as f:
    f.write(content)

