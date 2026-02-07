import csv
import json
import os
from pathlib import Path

from jobspy import scrape_jobs

PROGRESS_PREFIX = "JOBOPS_PROGRESS "


def _env_str(name: str, default: str) -> str:
    value = os.getenv(name)
    return value if value and value.strip() else default


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in ("1", "true", "yes", "y", "on")


def _emit_progress(event: str, payload: dict) -> None:
    serialized = json.dumps({"event": event, **payload}, ensure_ascii=True)
    print(f"{PROGRESS_PREFIX}{serialized}", flush=True)


def _parse_sites(raw: str) -> list[str]:
    return [s.strip() for s in raw.split(",") if s.strip()]


def main() -> int:
    sites = _parse_sites(_env_str("JOBSPY_SITES", "indeed,linkedin"))
    search_term = _env_str("JOBSPY_SEARCH_TERM", "web developer")
    location = _env_str("JOBSPY_LOCATION", "UK")
    results_wanted = _env_int("JOBSPY_RESULTS_WANTED", 200)
    hours_old = _env_int("JOBSPY_HOURS_OLD", 72)
    country_indeed = _env_str("JOBSPY_COUNTRY_INDEED", "UK")
    linkedin_fetch_description = _env_bool("JOBSPY_LINKEDIN_FETCH_DESCRIPTION", True)
    is_remote = _env_bool("JOBSPY_IS_REMOTE", False)
    term_index = _env_int("JOBSPY_TERM_INDEX", 1)
    term_total = _env_int("JOBSPY_TERM_TOTAL", 1)

    output_csv = Path(_env_str("JOBSPY_OUTPUT_CSV", "jobs.csv"))
    output_json = Path(
        _env_str("JOBSPY_OUTPUT_JSON", str(output_csv.with_suffix(".json")))
    )

    output_csv.parent.mkdir(parents=True, exist_ok=True)
    output_json.parent.mkdir(parents=True, exist_ok=True)

    print(f"jobspy: Search term: {search_term}")
    _emit_progress(
        "term_start",
        {
            "termIndex": term_index,
            "termTotal": term_total,
            "searchTerm": search_term,
        },
    )
    jobs = scrape_jobs(
        site_name=sites,
        search_term=search_term,
        location=location,
        results_wanted=results_wanted,
        hours_old=hours_old,
        country_indeed=country_indeed,
        linkedin_fetch_description=linkedin_fetch_description,
        is_remote=is_remote,
    )

    print(f"Found {len(jobs)} jobs")
    _emit_progress(
        "term_complete",
        {
            "termIndex": term_index,
            "termTotal": term_total,
            "searchTerm": search_term,
            "jobsFoundTerm": int(len(jobs)),
        },
    )

    jobs.to_csv(
        output_csv,
        quoting=csv.QUOTE_NONNUMERIC,
        escapechar="\\",
        index=False,
    )

    jobs.to_json(output_json, orient="records", force_ascii=False)

    print(f"Wrote CSV:  {output_csv}")
    print(f"Wrote JSON: {output_json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
