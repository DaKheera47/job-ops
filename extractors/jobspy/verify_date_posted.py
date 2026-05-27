import argparse
import json
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a tiny JobSpy scrape and print date_posted coverage.",
    )
    parser.add_argument(
        "--site",
        default="indeed",
        choices=["indeed", "linkedin", "glassdoor"],
        help="JobSpy site to query.",
    )
    parser.add_argument(
        "--search-term",
        default="software engineer",
        help="Search term to pass to JobSpy.",
    )
    parser.add_argument(
        "--location",
        default="London",
        help="Location to pass to JobSpy.",
    )
    parser.add_argument(
        "--country-indeed",
        default="UK",
        help="Country for Indeed and Glassdoor.",
    )
    parser.add_argument(
        "--results-wanted",
        type=int,
        default=5,
        help="Small result cap for the smoke test.",
    )
    parser.add_argument(
        "--hours-old",
        type=int,
        default=24,
        help="Only ask JobSpy for postings newer than this many hours.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print sample rows as JSON instead of a compact text table.",
    )
    return parser.parse_args()


def compact_value(value: Any) -> str | None:
    if value is None:
        return None
    try:
        if value != value:
            return None
    except TypeError:
        pass
    text = str(value).strip()
    return text or None


def main() -> int:
    args = parse_args()

    from jobspy import scrape_jobs

    kwargs: dict[str, Any] = {
        "site_name": [args.site],
        "search_term": args.search_term,
        "location": args.location,
        "results_wanted": args.results_wanted,
        "hours_old": args.hours_old,
    }
    if args.site in {"indeed", "glassdoor"}:
        kwargs["country_indeed"] = args.country_indeed

    print("Running JobSpy with:")
    print(json.dumps(kwargs, indent=2, sort_keys=True))

    jobs = scrape_jobs(**kwargs)
    print(f"\nRows returned: {len(jobs)}")
    print(f"Columns: {', '.join(map(str, jobs.columns))}")

    has_date_posted = "date_posted" in jobs.columns
    print(f"Has date_posted column: {has_date_posted}")
    if not has_date_posted:
        return 1

    non_empty = jobs["date_posted"].notna().sum()
    print(f"Rows with date_posted: {non_empty}/{len(jobs)}")

    sample_columns = [
        column
        for column in [
            "site",
            "title",
            "company",
            "location",
            "date_posted",
            "job_url",
        ]
        if column in jobs.columns
    ]
    samples = jobs[sample_columns].head(args.results_wanted).to_dict("records")

    print("\nSample rows:")
    if args.json:
        print(json.dumps(samples, indent=2, default=str, ensure_ascii=False))
    else:
        for index, row in enumerate(samples, start=1):
            title = compact_value(row.get("title")) or "(no title)"
            company = compact_value(row.get("company")) or "(no company)"
            posted = compact_value(row.get("date_posted")) or "(missing)"
            site = compact_value(row.get("site")) or args.site
            print(f"{index}. [{site}] {title} @ {company} | date_posted={posted}")

    return 0 if non_empty > 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
