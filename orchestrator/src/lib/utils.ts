import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Job } from "@shared/types"

// --- CSS ---
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// --- Dates ---
export const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return null;
  try {
    const normalized = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T");
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return dateStr;
    return parsed.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

export const formatDateTime = (dateStr?: string | null) => {
  if (!dateStr) return null;
  try {
    const normalized = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T");
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return dateStr;
    const date = parsed.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const time = parsed.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${date} ${time}`;
  } catch {
    return dateStr;
  }
};

// --- DOM & Clipboard ---
export async function copyTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!ok) {
    throw new Error("Copy failed");
  }
}

// --- Text Processing ---
export const stripHtml = (value: string) =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const safeFilenamePart = (value: string) => value.replace(/[^a-z0-9]/gi, "_");

// --- Comparisons & Math ---
export function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function clampInt(value: number, min: number, max: number) {
  const int = Math.floor(value);
  if (Number.isNaN(int)) return min;
  return Math.min(max, Math.max(min, int));
}

// --- Job Specific Helpers ---
export const formatJobForWebhook = (job: Job) => {
  return JSON.stringify(
    {
      event: "job.completed",
      sentAt: new Date().toISOString(),
      job,
    },
    null,
    2,
  );
};

export const sourceLabel: Record<Job["source"], string> = {
  gradcracker: "Gradcracker",
  indeed: "Indeed",
  linkedin: "LinkedIn",
  ukvisajobs: "UK Visa Jobs",
  manual: "Manual",
};
