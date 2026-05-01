type ZodLikeIssue = {
  code?: string;
  format?: string;
  minimum?: number;
  expected?: string;
  received?: string;
  type?: string;
  validation?: string;
  message?: string;
  path?: Array<string | number>;
};

const REQUEST_ID_SUFFIX_PATTERN = /\s*\(requestId:\s*[^)]+\)\s*$/i;
const DEFAULT_UNKNOWN_ERROR_MESSAGE = "Something went wrong. Please try again.";

function toIssuePath(path: Array<string | number> | undefined): string {
  if (!Array.isArray(path) || path.length === 0) return "";
  return path.map((segment) => String(segment)).join(".");
}

function normalizeSectionName(section: string): string {
  return section.endsWith("s") ? section.slice(0, -1) : section;
}

function toFriendlyFieldLabel(path: string): string | null {
  if (!path) return null;
  if (path === "jobDescription") return "job description";
  if (path === "job.jobUrl" || path === "jobUrl") return "job URL";
  if (path === "applicationLink" || path === "job.applicationLink") {
    return "application link";
  }
  if (/^sections\.skills\.items\.\d+\.name$/.test(path)) return "skill name";
  if (/^sections\.projects\.items\.\d+\.name$/.test(path))
    return "project name";

  const sectionMatch =
    /^sections\.([a-z-]+)\.items\.\d+\.([a-zA-Z0-9_-]+)$/.exec(path);
  if (sectionMatch) {
    const section = normalizeSectionName(sectionMatch[1] ?? "item");
    const field = (sectionMatch[2] ?? "field")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .toLowerCase();
    return `${section} ${field}`;
  }

  const lastSegment = path.split(".").at(-1);
  if (!lastSegment) return null;
  return lastSegment
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
}

function toSentenceCase(input: string): string {
  if (!input) return input;
  return input.charAt(0).toUpperCase() + input.slice(1);
}

function toFriendlyIssueMessage(issue: ZodLikeIssue): string | null {
  const path = toIssuePath(issue.path);
  const label = toFriendlyFieldLabel(path);

  if (path === "jobDescription") {
    return "Please enter a job description before continuing.";
  }

  if (/^sections\.skills\.items\.\d+\.name$/.test(path)) {
    return "Please enter a skill (e.g., Python, SQL).";
  }

  const normalizedIssueMessage = issue.message?.toLowerCase() ?? "";
  const isInvalidUrl =
    (issue.code === "invalid_string" && issue.validation === "url") ||
    (issue.code === "invalid_format" && issue.format === "url") ||
    /\binvalid\s+url\b/.test(normalizedIssueMessage);

  if (isInvalidUrl) {
    if (label === "application link") {
      return "Please enter a valid application link URL.";
    }
    return label
      ? `Please enter a valid ${label}.`
      : "Please enter a valid URL.";
  }

  if (
    issue.code === "too_small" &&
    issue.type === "string" &&
    issue.minimum === 1
  ) {
    if (label) {
      return `Please enter a ${label} before continuing.`;
    }
    return "Please fill in the required field before continuing.";
  }

  if (issue.code === "invalid_type") {
    if (label) {
      return `Please provide a valid ${label}.`;
    }
    return "Please check the entered value and try again.";
  }

  return null;
}

function toZodLikeIssues(value: unknown): ZodLikeIssue[] | null {
  if (Array.isArray(value)) {
    const issues = value.filter((entry): entry is ZodLikeIssue =>
      Boolean(entry && typeof entry === "object"),
    );
    return issues.length > 0 ? issues : null;
  }

  if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as { issues?: unknown }).issues)
  ) {
    return toZodLikeIssues((value as { issues: unknown[] }).issues);
  }

  return null;
}

function parseIssuesFromJsonMessage(message: string): ZodLikeIssue[] | null {
  const trimmed = message.trim();
  if (!(trimmed.startsWith("[") || trimmed.startsWith("{"))) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return toZodLikeIssues(parsed);
  } catch {
    return null;
  }
}

function parseIssueFromValidationMessage(message: string): ZodLikeIssue | null {
  const match =
    /validation failed at "([^"]+)":\s*(.+)$/i.exec(message) ??
    /at "([^"]+)":\s*(.+)$/i.exec(message);
  if (!match) return null;

  const path = match[1]?.split(".").filter(Boolean) ?? [];
  const detail = match[2]?.trim() ?? "";
  return {
    path,
    message: detail,
  };
}

function parseIssuesFromDetails(details: unknown): ZodLikeIssue[] | null {
  if (!details || typeof details !== "object") return null;

  const directIssues = toZodLikeIssues(details);
  if (directIssues) return directIssues;

  const detailsRecord = details as Record<string, unknown>;

  if (
    detailsRecord.fieldErrors &&
    typeof detailsRecord.fieldErrors === "object" &&
    !Array.isArray(detailsRecord.fieldErrors)
  ) {
    const fieldErrors = detailsRecord.fieldErrors as Record<string, unknown>;
    for (const [field, value] of Object.entries(fieldErrors)) {
      if (!Array.isArray(value) || value.length === 0) continue;
      const firstMessage = value.find((entry) => typeof entry === "string");
      if (typeof firstMessage === "string") {
        return [{ path: [field], message: firstMessage }];
      }
    }
  }

  return null;
}

function extractRawErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string") return maybeMessage;
  }
  if (error && typeof error === "object" && "error" in error) {
    const nestedError = (error as { error?: unknown }).error;
    if (nestedError && typeof nestedError === "object") {
      const maybeMessage = (nestedError as { message?: unknown }).message;
      if (typeof maybeMessage === "string") return maybeMessage;
    }
  }
  return "";
}

function extractErrorDetails(error: unknown): unknown {
  if (!error || typeof error !== "object") return null;
  if ("details" in error)
    return (error as { details?: unknown }).details ?? null;
  if ("error" in error) {
    const nestedError = (error as { error?: unknown }).error;
    if (
      nestedError &&
      typeof nestedError === "object" &&
      "details" in nestedError
    ) {
      return (nestedError as { details?: unknown }).details ?? null;
    }
  }
  return null;
}

export function stripRequestIdFromMessage(message: string): string {
  return message.replace(REQUEST_ID_SUFFIX_PATTERN, "").trim();
}

export function formatUserFacingError(
  error: unknown,
  fallback = DEFAULT_UNKNOWN_ERROR_MESSAGE,
): string {
  const raw = extractRawErrorMessage(error);
  const details = extractErrorDetails(error);

  const directIssues = toZodLikeIssues(error);
  if (directIssues && directIssues.length > 0) {
    const friendly = toFriendlyIssueMessage(directIssues[0]);
    if (friendly) return friendly;
  }

  const detailIssues = parseIssuesFromDetails(details);
  if (detailIssues && detailIssues.length > 0) {
    const friendly = toFriendlyIssueMessage(detailIssues[0]);
    if (friendly) return friendly;
  }

  if (!raw) return fallback;

  const message = stripRequestIdFromMessage(raw);
  if (!message) return fallback;

  const jsonIssues = parseIssuesFromJsonMessage(message);
  if (jsonIssues && jsonIssues.length > 0) {
    const friendly = toFriendlyIssueMessage(jsonIssues[0]);
    if (friendly) return friendly;
  }

  const validationIssue = parseIssueFromValidationMessage(message);
  if (validationIssue) {
    const friendly = toFriendlyIssueMessage(validationIssue);
    if (friendly) return friendly;

    const label = toFriendlyFieldLabel(toIssuePath(validationIssue.path));
    if (label) {
      return `${toSentenceCase(label)} is invalid. Please review and try again.`;
    }
  }

  if (message.trim().startsWith("{") || message.trim().startsWith("[")) {
    return fallback;
  }

  return message;
}
