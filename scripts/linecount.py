import argparse
import os
from collections import defaultdict
from pathlib import Path


SKIP_DIRS_DEFAULT = {
    ".git",
    ".venv",
    "venv",
    "node_modules",
    "dist",
    "build",
    "out",
    ".pytest_cache",
    "__pycache__",
    ".mypy_cache",
    ".ruff_cache",
    ".next",
    ".turbo",
    ".idea",
    ".vscode",
    "data",
    "tests",
    "__tests__",
    "spec",
    "specs",
    "cypress",
    "e2e",
}

ALLOWED_EXTS = {
    ".py",
    ".ts",
    ".tsx",
}

SPEC_BY_EXT = {
    ".py": {"line": ["#"], "block": [("'''", "'''"), ('"""', '"""')]},
    ".js": {"line": ["//"], "block": [("/*", "*/")]},
    ".jsx": {"line": ["//"], "block": [("/*", "*/")]},
    ".ts": {"line": ["//"], "block": [("/*", "*/")]},
    ".tsx": {"line": ["//"], "block": [("/*", "*/")]},
    ".cjs": {"line": ["//"], "block": [("/*", "*/")]},
    ".css": {"line": [], "block": [("/*", "*/")]},
    ".html": {"line": [], "block": [("<!--", "-->")]},
    ".htm": {"line": [], "block": [("<!--", "-->")]},
    ".md": {"line": [], "block": [("<!--", "-->")]},
    ".yml": {"line": ["#"], "block": []},
    ".yaml": {"line": ["#"], "block": []},
    ".env": {"line": ["#"], "block": []},
    ".example": {"line": ["#"], "block": []},
    ".sh": {"line": ["#"], "block": []},
    ".bash": {"line": ["#"], "block": []},
    ".zsh": {"line": ["#"], "block": []},
    ".ps1": {"line": ["#"], "block": [("<#", "#>")]},
    ".json": {"line": [], "block": []},
    ".txt": {"line": [], "block": []},
}

SPEC_BY_NAME = {
    "dockerfile": {"line": ["#"], "block": []},
    "makefile": {"line": ["#"], "block": []},
    ".gitignore": {"line": ["#"], "block": []},
    ".dockerignore": {"line": ["#"], "block": []},
    ".env": {"line": ["#"], "block": []},
    ".env.example": {"line": ["#"], "block": []},
}


def is_binary(path: str) -> bool:
    try:
        with open(path, "rb") as f:
            return b"\x00" in f.read(2048)
    except Exception:
        return True


def get_spec(path: Path):
    name = path.name.lower()
    if name in SPEC_BY_NAME:
        return SPEC_BY_NAME[name]
    ext = path.suffix.lower()
    return SPEC_BY_EXT.get(ext, {"line": [], "block": []})


def count_file(path: Path):
    spec = get_spec(path)
    line_comments = spec["line"]
    block_comments = spec["block"]

    code = comment = blank = 0
    in_block_end = None

    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            stripped = line.strip()
            if not stripped:
                blank += 1
                continue

            if in_block_end:
                end = in_block_end
                if end in stripped:
                    _, after_end = stripped.split(end, 1)
                    if after_end.strip():
                        code += 1
                    else:
                        comment += 1
                    in_block_end = None
                else:
                    comment += 1
                continue

            if line_comments and any(
                stripped.startswith(prefix) for prefix in line_comments
            ):
                comment += 1
                continue

            started = False
            for start, end in block_comments:
                idx = stripped.find(start)
                if idx != -1:
                    before = stripped[:idx].strip()
                    after = stripped[idx + len(start) :]
                    if before:
                        code += 1
                    else:
                        if end in after:
                            after_end = after.split(end, 1)[1].strip()
                            if after_end:
                                code += 1
                            else:
                                comment += 1
                        else:
                            comment += 1
                            in_block_end = end
                    started = True
                    break
            if started:
                continue

            code += 1

    return code, comment, blank


def is_test_file(path: Path) -> bool:
    stem = path.stem.lower()
    return (
        stem.startswith("test_")
        or stem.startswith("test-")
        or stem.endswith("_test")
        or stem.endswith("-test")
        or stem.endswith(".test")
        or stem.endswith(".spec")
        or stem == "test"
        or "setuptests" in stem
        or "vitest.setup" in stem
        or "jest.setup" in stem
        or "test-utils" in stem
    )


def parse_args():
    parser = argparse.ArgumentParser(
        description="Count code/comment/blank lines by extension."
    )
    parser.add_argument(
        "root",
        nargs="?",
        default=".",
        help="Root directory to scan (default: current directory).",
    )
    parser.add_argument(
        "--include-dir",
        action="append",
        default=[],
        help="Directory name to include even if normally skipped (repeatable).",
    )
    parser.add_argument(
        "--exclude-dir",
        action="append",
        default=[],
        help="Directory name to exclude (repeatable).",
    )
    parser.add_argument(
        "--list-files",
        action="store_true",
        help="List all files that are counted.",
    )
    parser.add_argument(
        "--include-tests",
        action="store_true",
        help="Count test files (normally skipped).",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    root = Path(args.root).resolve()

    skip_dirs = set(SKIP_DIRS_DEFAULT)
    skip_dirs.difference_update(args.include_dir)
    skip_dirs.update(args.exclude_dir)

    ext_stats = defaultdict(lambda: {"files": 0, "code": 0, "comment": 0, "blank": 0})

    for dirpath, dirnames, filenames in os.walk(root):
        # prune walk by directory name
        dirnames[:] = [d for d in dirnames if d not in skip_dirs]

        for name in filenames:
            path = Path(dirpath) / name

            ext = path.suffix.lower()
            if ext not in ALLOWED_EXTS:
                continue

            if not args.include_tests and is_test_file(path):
                continue

            if is_binary(str(path)):
                continue

            if args.list_files:
                print(f"Counting: {path.relative_to(root)}")

            code, comment, blank = count_file(path)

            key = ext if ext else "<none>"
            ext_stats[key]["files"] += 1
            ext_stats[key]["code"] += code
            ext_stats[key]["comment"] += comment
            ext_stats[key]["blank"] += blank

    all_files = sum(v["files"] for v in ext_stats.values())
    all_code = sum(v["code"] for v in ext_stats.values())
    all_comment = sum(v["comment"] for v in ext_stats.values())
    all_blank = sum(v["blank"] for v in ext_stats.values())
    all_lines = all_code + all_comment + all_blank

    print(f"Total files: {all_files}")
    print(f"Total lines: {all_lines}")
    print(f"Code lines: {all_code}")
    print(f"Comment lines: {all_comment}")
    print(f"Blank lines: {all_blank}")
    print("")
    print("Lines by extension (code/comment/blank/total, files):")

    def sort_key(item):
        stats = item[1]
        return stats["code"] + stats["comment"] + stats["blank"]

    for ext, stats in sorted(ext_stats.items(), key=sort_key, reverse=True):
        total = stats["code"] + stats["comment"] + stats["blank"]
        print(
            f"{ext}\t{stats['code']}\t{stats['comment']}\t{stats['blank']}\t{total}\tfiles:{stats['files']}"
        )


if __name__ == "__main__":
    main()
