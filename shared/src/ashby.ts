export const ASHBY_JOBS_ORIGIN = "https://jobs.ashbyhq.com";
export const ASHBY_API_ORIGIN = "https://api.ashbyhq.com";
export const ASHBY_JOB_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

// Verified careers aliases; never infer an Ashby board from a company hostname.
const COMPANY_BOARDS: Record<string, string> = {
  "www.ashbyhq.com": "ashby",
  "linear.app": "linear",
  "www.notion.com": "notion",
  "ramp.com": "ramp",
  "www.vanta.com": "vanta",
  "supabase.com": "supabase",
  "openai.com": "openai",
  "cursor.com": "cursor",
  "elevenlabs.io": "elevenlabs",
  "lovable.dev": "lovable",
};

export function parseAshbyUrl(input: string): {
  board: string;
  careersUrl: string;
} {
  const url = new URL(input.trim());
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error(
      "Ashby sources must use HTTPS without credentials or a custom port.",
    );
  }
  const parts = url.pathname.split("/").filter(Boolean);
  let board: string | undefined;
  if (url.origin === ASHBY_JOBS_ORIGIN) {
    if (
      parts.length === 1 ||
      ((parts.length === 2 ||
        (parts.length === 3 && parts[2] === "application")) &&
        ASHBY_JOB_ID.test(parts[1] ?? ""))
    ) {
      board = parts[0];
    }
  } else if (
    url.origin === ASHBY_API_ORIGIN &&
    parts.length === 3 &&
    parts[0] === "posting-api" &&
    parts[1] === "job-board"
  ) {
    board = parts[2];
  } else if (/^\/(?:company\/)?careers(?:\/|$)/.test(url.pathname)) {
    board = COMPANY_BOARDS[url.hostname];
  }
  if (
    !board ||
    !/^[a-z0-9][a-z0-9_-]{0,119}$/i.test(board) ||
    ["api", "form", "jobs", "application"].includes(board.toLowerCase())
  ) {
    throw new Error(
      "Use an Ashby board URL or a supported company careers page.",
    );
  }
  board = board.toLowerCase();
  return {
    board,
    careersUrl:
      board === "cursor"
        ? "https://cursor.com/careers"
        : `${ASHBY_JOBS_ORIGIN}/${board}`,
  };
}

export function ashbyBoardLabel(board: string): string {
  const names: Record<string, string> = {
    openai: "OpenAI",
    elevenlabs: "ElevenLabs",
  };
  return (
    names[board] ??
    board.replace(
      /(^|[-_])(\w)/g,
      (_match, separator, letter: string) =>
        `${separator ? " " : ""}${letter.toUpperCase()}`,
    )
  );
}
