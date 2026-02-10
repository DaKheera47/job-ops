import csv
import json
import os
from pathlib import Path

import pandas as pd
from jobspy import scrape_jobs

PROGRESS_PREFIX = "JOBOPS_PROGRESS "
COUNTRY_ALIASES = {
    "uk": "united kingdom",
    "united kingdom": "united kingdom",
    "us": "united states",
    "usa": "united states",
    "united states": "united states",
    "türkiye": "turkey",
    "czech republic": "czechia",
}


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


def _normalize_country_token(value: str) -> str:
    normalized = " ".join(value.strip().lower().split())
    return COUNTRY_ALIASES.get(normalized, normalized)


def _is_country_level_location(location: str, country_indeed: str) -> bool:
    if not location.strip() or not country_indeed.strip():
        return False
    return _normalize_country_token(location) == _normalize_country_token(country_indeed)


def _scrape_for_sites(
    *,
    sites: list[str],
    search_term: str,
    location: str | None,
    results_wanted: int,
    hours_old: int,
    country_indeed: str,
    linkedin_fetch_description: bool,
    is_remote: bool,
) -> pd.DataFrame:
    kwargs: dict[str, object] = {
        "site_name": sites,
        "search_term": search_term,
        "results_wanted": results_wanted,
        "hours_old": hours_old,
        "country_indeed": country_indeed,
        "linkedin_fetch_description": linkedin_fetch_description,
        "is_remote": is_remote,
    }
    if location and location.strip():
        kwargs["location"] = location
    return scrape_jobs(**kwargs)


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
    frames: list[pd.DataFrame] = []
    non_glassdoor_sites = [site for site in sites if site != "glassdoor"]

    if non_glassdoor_sites:
        frames.append(
            _scrape_for_sites(
                sites=non_glassdoor_sites,
                search_term=search_term,
                location=location,
                results_wanted=results_wanted,
                hours_old=hours_old,
                country_indeed=country_indeed,
                linkedin_fetch_description=linkedin_fetch_description,
                is_remote=is_remote,
            )
        )

    if "glassdoor" in sites:
        glassdoor_location = location
        if _is_country_level_location(location, country_indeed):
            # Glassdoor treats location as a city-level filter; country-only values can fail.
            glassdoor_location = None
            print(
                "jobspy: Glassdoor location matched country; using country-only search"
            )
        frames.append(
            _scrape_for_sites(
                sites=["glassdoor"],
                search_term=search_term,
                location=glassdoor_location,
                results_wanted=results_wanted,
                hours_old=hours_old,
                country_indeed=country_indeed,
                linkedin_fetch_description=linkedin_fetch_description,
                is_remote=is_remote,
            )
        )

    jobs = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()

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
