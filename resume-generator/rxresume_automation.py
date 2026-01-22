"""
Automate RXResume (rxresu.me) to import resume and export PDF using Playwright.
"""

import os
from pathlib import Path
from playwright.sync_api import sync_playwright

# Configuration
RXRESUME_EMAIL = os.getenv("RXRESUME_EMAIL", "")
RXRESUME_PASSWORD = os.getenv("RXRESUME_PASSWORD", "")

BASE_DIR = Path(__file__).parent

# Allow override via environment variables (used by orchestrator)
_custom_json_path = os.getenv("RESUME_JSON_PATH")
RESUME_JSON_PATH = (
    Path(_custom_json_path) if _custom_json_path else BASE_DIR / "base.json"
)

_custom_output_filename = os.getenv("OUTPUT_FILENAME")
OUTPUT_FILENAME = _custom_output_filename if _custom_output_filename else "resume.pdf"

# Output directory - can be overridden by orchestrator
_custom_output_dir = os.getenv("OUTPUT_DIR")
OUTPUT_DIR = Path(_custom_output_dir) if _custom_output_dir else BASE_DIR / "resumes"


def login(page):
    """Log in to RXResume."""
    page.goto("https://v4.rxresu.me/auth/login")
    page.fill('input[placeholder="john.doe@example.com"]', RXRESUME_EMAIL)
    page.fill('input[type="password"]', RXRESUME_PASSWORD)
    page.click('button:has-text("Sign in")')
    page.wait_for_url("**/dashboard/resumes", timeout=15000)
    page.click('button:has-text("List")')


def import_resume(page, json_path: Path):
    """Import a resume JSON file."""
    # Log the JSON file size for debugging
    try:
        import json
        with open(json_path, 'r') as f:
            data = json.load(f)
        print(f"   📋 JSON keys: {list(data.keys())}")
        if 'basics' in data:
            print(f"   📋 Headline: {data['basics'].get('headline', 'N/A')[:50]}...")
    except Exception as e:
        print(f"   ⚠️ Could not read JSON for logging: {e}")

    page.click('h4:has-text("Import")')
    page.set_input_files('input[type="file"]', str(json_path))
    page.click('button:has-text("Validate")')

    # Wait for validation to complete - check for either success (Import button) or error
    try:
        # Wait for the Import button to become visible (validation succeeded)
        page.wait_for_selector('button:has-text("Import"):not([disabled])', timeout=10000)
    except Exception as e:
        # Save debug files to errors folder (accessible outside Docker)
        errors_dir = OUTPUT_DIR.parent / "errors"
        errors_dir.mkdir(parents=True, exist_ok=True)

        # Take a screenshot for debugging
        try:
            screenshot_path = errors_dir / f"debug_{json_path.stem}.png"
            page.screenshot(path=str(screenshot_path))
            print(f"   📸 Debug screenshot saved: {screenshot_path}")
        except Exception as screenshot_err:
            print(f"   ⚠️ Could not save screenshot: {screenshot_err}")

        # Copy the failed JSON to errors folder for inspection
        try:
            import shutil
            failed_json_path = errors_dir / f"{json_path.stem}.json"
            shutil.copy(str(json_path), str(failed_json_path))
            print(f"   📋 Failed JSON saved: {failed_json_path}")
        except Exception as copy_err:
            print(f"   ⚠️ Could not save failed JSON: {copy_err}")

        # Check for validation error messages in the dialog
        error_selectors = [
            'text=/error|invalid|failed/i',
            '[class*="error"]',
            '[class*="destructive"]',
            '.text-red-500',
            '.text-destructive',
            '[role="alert"]',
        ]
        for selector in error_selectors:
            error_element = page.query_selector(selector)
            if error_element:
                error_text = error_element.inner_text().strip()
                if error_text:
                    print(f"   ❌ RXResume validation error: {error_text}")
                    raise RuntimeError(f"RXResume validation failed: {error_text}")

        # Log what's visible in the dialog for debugging
        dialog = page.query_selector('[role="dialog"]')
        if dialog:
            dialog_text = dialog.inner_text()[:500]
            print(f"   📋 Dialog content: {dialog_text}")

        raise RuntimeError(f"Import button not found after validation (timeout): {e}")

    page.click('button:has-text("Import")')


def navigate_to_top_resume(page):
    """Navigate to the first resume in the editor."""
    if "/dashboard/resumes" not in page.url:
        page.goto("https://v4.rxresu.me/dashboard/resumes")
        page.wait_for_load_state("networkidle")

    # wait a beat for the list to update
    page.wait_for_timeout(1000)
    page.click('span[data-state="closed"]:first-of-type div:first-of-type')
    page.wait_for_url("**/builder/**", timeout=10000)


def export_pdf(page, output_path: Path) -> Path:
    """Export the resume as PDF."""
    page.wait_for_timeout(1500)  # Wait for builder to fully load

    selector = "div.inline-flex.items-center.justify-center.rounded-full.bg-background.px-4.shadow-xl button:last-of-type"

    with page.expect_download(timeout=30000) as download_info:
        page.click(selector)

    download = download_info.value
    output_path.parent.mkdir(parents=True, exist_ok=True)
    download.save_as(str(output_path))
    return output_path


def generate_resume_pdf(
    output_filename: str = None,
    import_json: bool = True,
    json_path: Path = None,
) -> Path:
    """
    Import resume and export PDF.

    Args:
        output_filename: Name of the output PDF file (defaults to OUTPUT_FILENAME env var)
        import_json: Whether to import a JSON file first (default True)
        json_path: Path to JSON file (defaults to RESUME_JSON_PATH env var)

    Returns:
        Path to the generated PDF
    """
    # Use environment-provided defaults
    actual_filename = output_filename or OUTPUT_FILENAME
    actual_json_path = json_path or RESUME_JSON_PATH
    output_path = OUTPUT_DIR / actual_filename

    print(f"📄 Generating PDF: {actual_filename}")
    print(f"   JSON source: {actual_json_path}")

    with sync_playwright() as playwright:
        browser = playwright.firefox.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        try:
            login(page)

            if import_json:
                import_resume(page, actual_json_path)

            navigate_to_top_resume(page)
            export_pdf(page, output_path)
        finally:
            browser.close()

    print(f"✅ PDF saved: {output_path}")
    return output_path


if __name__ == "__main__":
    # When run directly, use environment variables or defaults
    pdf_path = generate_resume_pdf()
    print(f"Done! PDF saved: {pdf_path}")
