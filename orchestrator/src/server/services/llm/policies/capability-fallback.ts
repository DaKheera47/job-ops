import type { ResponseMode } from "../types";

export function isCapabilityError(args: {
  mode: ResponseMode;
  status?: number;
  body?: string;
}): boolean {
  if (args.mode === "none") return false;
  if (args.status !== 400) return false;
  const body = (args.body || "").toLowerCase();

  if (body.includes("model") && body.includes("not")) return false;
  if (body.includes("unknown model")) return false;

  return (
    body.includes("response_format") ||
    body.includes("json_schema") ||
    body.includes("json_object") ||
    body.includes("text.format") ||
    body.includes("response schema") ||
    body.includes("responseschema") ||
    body.includes("responsemime") ||
    body.includes("response_mime")
  );
}
